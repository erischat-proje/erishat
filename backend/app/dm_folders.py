"""Per-user conversation archive and password protected folder."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import re
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .db import get_db
from .models import ConversationMember, Message, User
from .platform_models import ConversationFolder, ConversationVault, ConversationVaultSession, MessageHidden

router = APIRouter(prefix="/v1", tags=["message-folders"])
_current_user = None


def register_auth(dependency):
    global _current_user
    _current_user = dependency


def _auth_user(db: Session = Depends(get_db), authorization: str | None = Header(default=None)):
    return _current_user(db, authorization)


def _hash(value: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", value.encode(), salt, 210_000)
    return salt.hex() + ":" + digest.hex()


def _matches(value: str, encoded: str) -> bool:
    try:
        salt, expected = encoded.split(":", 1)
        digest = hashlib.pbkdf2_hmac("sha256", value.encode(), bytes.fromhex(salt), 210_000)
        return hmac.compare_digest(digest, bytes.fromhex(expected))
    except (ValueError, TypeError):
        return False


def _valid_pin(pin: str):
    if not re.fullmatch(r"[0-9]{6}", pin):
        raise HTTPException(400, "Şifre tam 6 rakam olmalı")


def _folder(db: Session, user_id: str, conversation_id: str):
    return db.scalar(select(ConversationFolder).where(
        ConversationFolder.user_id == user_id, ConversationFolder.conversation_id == conversation_id))


def _member(db: Session, user_id: str, conversation_id: str):
    if not db.scalar(select(ConversationMember.id).where(
        ConversationMember.user_id == user_id, ConversationMember.conversation_id == conversation_id)):
        raise HTTPException(403, "Bu konuşmaya erişiminiz yok")


def _session(db: Session, user_id: str, token: str | None, scope: str = "access") -> bool:
    if not token or len(token) > 128:
        return False
    row = db.get(ConversationVaultSession, hashlib.sha256(token.encode()).hexdigest())
    return bool(row and row.user_id == user_id and row.scope == scope and row.expires_at > datetime.now(timezone.utc))


def require_unlocked(db: Session, user_id: str, conversation_id: str, token: str | None):
    row = _folder(db, user_id, conversation_id)
    if row and row.locked and not _session(db, user_id, token):
        raise HTTPException(403, "Kilitli sohbetlere erişmek için şifrenizi girin")


def _issue(db: Session, user_id: str, scope: str = "access") -> str:
    raw = secrets.token_urlsafe(32)
    db.add(ConversationVaultSession(token_hash=hashlib.sha256(raw.encode()).hexdigest(), user_id=user_id, scope=scope,
                                    expires_at=datetime.now(timezone.utc) + timedelta(minutes=30)))
    db.commit()
    return raw


def _clear_sessions(db: Session, user_id: str):
    db.execute(delete(ConversationVaultSession).where(ConversationVaultSession.user_id == user_id))


def _reset_empty(db: Session, user_id: str):
    if db.scalar(select(ConversationFolder.id).where(
            ConversationFolder.user_id == user_id, ConversationFolder.locked.is_(True)).limit(1)) is None:
        vault = db.get(ConversationVault, user_id)
        if vault:
            db.delete(vault)
        _clear_sessions(db, user_id)


class VaultSetup(BaseModel):
    pin: str
    hint: str = Field(min_length=1, max_length=30)
    answer: str = Field(min_length=1, max_length=100)


class VaultPin(BaseModel):
    pin: str


class VaultAnswer(BaseModel):
    answer: str


class VaultChange(VaultSetup):
    old_pin: str | None = None
    old_answer: str | None = None


class FolderUpdate(BaseModel):
    archived: bool | None = None
    locked: bool | None = None
    pin: str | None = None


@router.get("/me/dm-vault")
def vault_status(db: Session = Depends(get_db), user: User = Depends(_auth_user)):
    vault = db.get(ConversationVault, user.id)
    count = len(list(db.scalars(select(ConversationFolder.id).where(
        ConversationFolder.user_id == user.id, ConversationFolder.locked.is_(True)))))
    return {"configured": bool(vault), "locked_count": count}


@router.post("/me/dm-vault/setup")
def setup_vault(payload: VaultSetup, db: Session = Depends(get_db), user: User = Depends(_auth_user)):
    _valid_pin(payload.pin)
    if db.get(ConversationVault, user.id):
        raise HTTPException(409, "Kilitli sohbet şifreniz zaten oluşturulmuş")
    hint, answer = payload.hint.strip(), payload.answer.strip()
    if not hint or not answer:
        raise HTTPException(400, "İpucu ve cevabı zorunlu")
    db.add(ConversationVault(user_id=user.id, pin_hash=_hash(payload.pin), hint=hint,
                             answer_hash=_hash(answer.casefold())))
    db.commit()
    return {"token": _issue(db, user.id)}


@router.post("/me/dm-vault/unlock")
def unlock_vault(payload: VaultPin, db: Session = Depends(get_db), user: User = Depends(_auth_user)):
    _valid_pin(payload.pin)
    vault = db.get(ConversationVault, user.id)
    if not vault or not _matches(payload.pin, vault.pin_hash):
        raise HTTPException(403, "Kilitli sohbet şifresi yanlış")
    return {"token": _issue(db, user.id)}


@router.get("/me/dm-vault/recover")
def recovery_hint(db: Session = Depends(get_db), user: User = Depends(_auth_user)):
    vault = db.get(ConversationVault, user.id)
    if not vault:
        raise HTTPException(404, "Kilitli sohbet şifresi bulunamadı")
    return {"hint": vault.hint, "attempts_left": max(0, 5-vault.failed_attempts)}


@router.post("/me/dm-vault/recover")
def recover_vault(payload: VaultAnswer, db: Session = Depends(get_db), user: User = Depends(_auth_user)):
    vault = db.scalar(select(ConversationVault).where(ConversationVault.user_id == user.id).with_for_update())
    if not vault:
        raise HTTPException(404, "Kilitli sohbet şifresi bulunamadı")
    if not _matches(payload.answer.strip().casefold(), vault.answer_hash):
        # Serialized per user, so simultaneous attempts still count separately.
        vault.failed_attempts += 1
        left = max(0, 5-vault.failed_attempts)
        if not left:
            ids = list(db.scalars(select(ConversationFolder.conversation_id).where(
                ConversationFolder.user_id == user.id, ConversationFolder.locked.is_(True))))
            for conversation_id in ids:
                already = select(MessageHidden.message_id).where(MessageHidden.user_id == user.id)
                for message_id in db.scalars(select(Message.id).where(Message.conversation_id == conversation_id,
                                                                       ~Message.id.in_(already))):
                    db.add(MessageHidden(user_id=user.id, message_id=message_id))
            db.execute(delete(ConversationFolder).where(ConversationFolder.user_id == user.id,
                                                         ConversationFolder.locked.is_(True)))
            _clear_sessions(db, user.id)
            db.delete(vault)
            db.commit()
            raise HTTPException(410, "Tüm haklarınızı doldurdunuz, kilitli mesajlarınız imha edilmiştir")
        db.commit()
        raise HTTPException(403, f"Verdiğiniz cevap yanlış. {left} deneme hakkınız kaldı. Haklarınız dolarsa kilitli mesajlarınız imha edilecektir")
    vault.failed_attempts = 0
    db.commit()
    return {"recovery_token": _issue(db, user.id, "recovery")}


@router.put("/me/dm-vault")
def change_vault(payload: VaultChange, x_eris_dm_vault: str | None = Header(default=None),
                 db: Session = Depends(get_db), user: User = Depends(_auth_user)):
    vault = db.get(ConversationVault, user.id)
    if not vault:
        raise HTTPException(404, "Kilitli sohbet şifresi bulunamadı")
    _valid_pin(payload.pin)
    recovered = _session(db, user.id, x_eris_dm_vault, "recovery")
    if not (recovered or _session(db, user.id, x_eris_dm_vault)):
        raise HTTPException(403, "Önce mevcut şifrenizle veya ipucu cevabınızla doğrulayın")
    if not recovered:
        if not (payload.old_pin and _matches(payload.old_pin, vault.pin_hash)
                and payload.old_answer and _matches(payload.old_answer.strip().casefold(), vault.answer_hash)):
            raise HTTPException(403, "Mevcut şifre veya ipucu cevabı yanlış")
    if not payload.hint.strip() or not payload.answer.strip():
        raise HTTPException(400, "İpucu ve cevabı zorunlu")
    vault.pin_hash = _hash(payload.pin)
    vault.hint = payload.hint.strip()
    vault.answer_hash = _hash(payload.answer.strip().casefold())
    vault.failed_attempts = 0
    _clear_sessions(db, user.id)
    db.commit()
    return {"token": _issue(db, user.id)}


@router.patch("/conversations/{conversation_id}/folder")
def update_folder(conversation_id: str, payload: FolderUpdate,
                  x_eris_dm_vault: str | None = Header(default=None),
                  db: Session = Depends(get_db), user: User = Depends(_auth_user)):
    _member(db, user.id, conversation_id)
    row = _folder(db, user.id, conversation_id)
    if payload.locked is not None and not db.get(ConversationVault, user.id):
        raise HTTPException(409, "Önce kilitli sohbet şifresi oluşturun")
    if (payload.locked is not None or (row and row.locked)) and not _session(db, user.id, x_eris_dm_vault):
        raise HTTPException(403, "Kilitli sohbet şifrenizi girin")
    if payload.locked is False and row and row.locked:
        vault = db.get(ConversationVault, user.id)
        if not payload.pin or not vault or not _matches(payload.pin, vault.pin_hash):
            raise HTTPException(403, "Kilidi kaldırmak için mevcut 6 haneli şifrenizi girin")
    if row is None:
        row = ConversationFolder(user_id=user.id, conversation_id=conversation_id)
        db.add(row)
    if payload.archived is not None:
        row.archived = payload.archived
    if payload.locked is not None:
        row.locked = payload.locked
        if payload.locked:
            row.archived = False
    db.flush()
    _reset_empty(db, user.id)
    db.commit()
    return {"archived": row.archived, "locked": row.locked}
