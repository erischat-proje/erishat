"""Fail-closed social upload moderation; optional feature-flag to avoid accidental outage.

This module does NOT identify CSAM. Suspected child abuse content needs a dedicated
legal escalation workflow, not this general-purpose image classification API.
"""
from __future__ import annotations
import base64
import hashlib
import json
import os
import subprocess
import tempfile
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from sqlalchemy import func, select, or_
from .safety_models import SafetyReview, SafetySuspension


def enabled():
    return os.environ.get('LIDYA_SOCIAL_SAFETY_ENABLED', '0').lower() in {'1', 'yes', 'true'}


def _images(data: bytes, mime: str):
    if mime in ('image/jpeg', 'image/png', 'image/webp'):
        return [(data, mime)]
    if mime not in ('image/gif', 'video/mp4', 'video/webm'):
        raise HTTPException(415, 'Güvenli medya türü doğrulanamadı.')
    suffix = { 'image/gif': '.gif', 'video/mp4': '.mp4', 'video/webm': '.webm'}[mime]
    frames = []
    with tempfile.TemporaryDirectory(prefix='lidya-scan-') as workdir:
        source = workdir + '/input' + suffix
        with open(source, 'wb') as fh:
            fh.write(data)
        # Sample opening, middle and later frames. This is a partial video scan,
        # not exhaustive detection of every possible frame.
        for position in (0, 3, 10):
            cmd = ['ffmpeg', '-hide_banner', '-nostdin', '-loglevel', 'error', '-ss', str(position), '-i', source,
                   '-frames:v', '1', '-vf', 'scale=512:512:force_original_aspect_ratio=decrease',
                   '-f', 'image2', '-vcodec', 'mjpeg', 'pipe:1']
            try:
                p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=25, check=False)
            except (OSError, subprocess.TimeoutExpired) as exc:
                raise HTTPException(503, 'Video güvenlik taraması şu anda yapılamıyor.') from exc
            if p.returncode == 0 and p.stdout:
                frames.append((p.stdout, 'image/jpeg'))
    if not frames:
        raise HTTPException(422, 'Video kareleri güvenlik kontrolünden geçirilemedi.')
    return frames


def _moderate(image: bytes, mime: str, caption: str):
    key = os.environ.get('OPENAI_API_KEY', '').strip()
    if not key:
        raise HTTPException(503, 'Görsel güvenlik kontrolü yapılandırılmadı.')
    payload = {'model': 'omni-moderation-latest', 'input': [
        {'type': 'text', 'text': caption or 'Image content classification'},
        {'type': 'image_url', 'image_url': {'url': 'data:' + mime + ';base64,' + base64.b64encode(image).decode('ascii')}}
    ]}
    req = urllib.request.Request('https://api.openai.com/v1/moderations', data=json.dumps(payload).encode(),
                                 headers={'Authorization':'Bearer ' + key, 'Content-Type':'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=18) as response:
            obj = json.load(response)
    except (urllib.error.URLError, TimeoutError, ValueError, OSError) as exc:
        raise HTTPException(503, 'İçerik denetimi geçici olarak kullanılamıyor. Daha sonra yeniden deneyin.') from exc
    results = obj.get('results') or []
    if len(results) != 1:
        raise HTTPException(503, 'Görsel denetimi yanıtı doğrulanamadı.')
    scores = results[0].get('category_scores') or {}
    categories = results[0].get('categories') or {}
    value = float(scores.get('sexual', 0))
    return value, bool(categories.get('sexual'))


def check_upload(db, user_id: str, surface: str, mime: str | None, data: bytes | None, caption: str=''):
    if not enabled() or data is None:
        return
    digest = hashlib.sha256(data).hexdigest()
    prior = db.scalar(select(SafetyReview).where(SafetyReview.user_id==user_id, SafetyReview.sha256==digest))
    if prior:
        raise HTTPException(422, 'Bu medya daha önce incelemeye alınmış. Aynı dosyayı tekrar yükleyemezsiniz.')
    maxscore, flagged = 0.0, False
    for frame, frame_mime in _images(data, mime):
        score, hit = _moderate(frame, frame_mime, caption)
        maxscore = max(maxscore, score)
        flagged |= hit
    # Suspicious results never publish; only a *human confirmed* finding gets a strike.
    if flagged or maxscore >= float(os.environ.get('LIDYA_SOCIAL_REVIEW_THRESHOLD', '0.3')):
        row = SafetyReview(user_id=user_id, sha256=digest, surface=surface,
                           score=f'{maxscore:.4f}', status='pending')
        db.add(row)
        db.commit()
        raise HTTPException(422, 'Görsel +18 içerik kontrolüne takıldı. İçeriğiniz yayınlanmadı; yetkili incelemesi istenebilir.')


def require_safety_admin(db, user):
    from .admin_models import AdminRole
    role = db.get(AdminRole, user.id)
    if not role or role.role not in {'FA', 'DA'}:
        raise HTTPException(403, 'İçerik güvenliği inceleme yetkiniz yok.')
    return role.role


def admin_queue(db, user):
    require_safety_admin(db, user)
    return [{'id': r.id, 'user_id': r.user_id, 'surface': r.surface, 'score': r.score,
             'status': r.status, 'created_at': r.created_at}
            for r in db.scalars(select(SafetyReview).where(SafetyReview.status.in_(['pending','pending_final']))
                                .order_by(SafetyReview.created_at.asc()).limit(100))]


def decide(db, user, review_id: int, approve: bool, note: str):
    require_safety_admin(db, user)
    review = db.scalar(select(SafetyReview).where(SafetyReview.id==review_id).with_for_update())
    if review and review.user_id == user.id:
        raise HTTPException(403, 'Yetkili kendi hesabının içerik kararını veremez.')
    if not review or review.status not in {'pending', 'pending_final'}:
        raise HTTPException(404, 'Bekleyen inceleme bulunamadı.')
    if review.status == 'pending_final':
        if review.reviewer_id == user.id:
            raise HTTPException(403, 'Kalıcı ban için bağımsız ikinci onay gerekli.')
        if not approve:
            review.status = 'rejected'; review.second_reviewer_id = user.id
        else:
            review.status = 'confirmed'; review.second_reviewer_id = user.id
            db.add(SafetySuspension(user_id=review.user_id, review_id=review.id, expires_at=None))
        review.decision_note = note
        review.reviewed_at = datetime.now(timezone.utc)
        db.commit()
        return {'review_id': review.id, 'status': review.status, 'punishment':'permanent' if approve else 'none'}
    if not approve:
        review.status = 'rejected'; review.reviewer_id = user.id; review.decision_note = note
        review.reviewed_at = datetime.now(timezone.utc); db.commit()
        return {'review_id':review.id,'status':'rejected','punishment':'none'}
    # Serialize all strike confirmations for an account using row lock.
    from .models import User
    db.scalar(select(User.id).where(User.id==review.user_id).with_for_update())
    confirmed = db.scalar(select(func.count(SafetyReview.id)).where(SafetyReview.user_id==review.user_id,
                                                                    SafetyReview.status=='confirmed')) or 0
    pending_final = db.scalar(select(func.count(SafetyReview.id)).where(SafetyReview.user_id==review.user_id,
                                                                        SafetyReview.status=='pending_final')) or 0
    if pending_final:
        raise HTTPException(409, 'Bu hesapta kalıcı ban onayı bekleniyor.')
    strike = int(confirmed) + 1
    review.reviewer_id=user.id; review.decision_note=note; review.reviewed_at=datetime.now(timezone.utc)
    if strike >= 4:
        review.status='pending_final'; punishment='awaiting_independent_approval'
    else:
        review.status='confirmed'
        if strike in (2, 3):
            days = 3 if strike==2 else 7
            db.add(SafetySuspension(user_id=review.user_id, review_id=review.id,
                                    expires_at=datetime.now(timezone.utc)+timedelta(days=days)))
        punishment = {1:'warning',2:'3_days',3:'7_days'}[strike]
    db.commit()
    return {'review_id':review.id,'status':review.status,'strike':strike,'punishment':punishment}
