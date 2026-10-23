"""Bounded discovery queries, stable keyset pages, private saved/hidden/muted state."""
import base64
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select, func, and_, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from .db import get_db
from .models import User
from .platform_models import SocialPost, SocialPostLike, SocialPostComment, UserFollow, UserBlock
from .admin_models import UserBan
from .ban_workflow_models import UserBrowserDevice
from .explore_models import SavedPost, HiddenPost, MutedAuthor

VERSION='explore-workspace-v1-20261023'

def visible_query(user):
    follows=select(UserFollow.following_id).where(UserFollow.follower_id==user.id)
    blocked=select(UserBlock.blocked_id).where(UserBlock.blocker_id==user.id)
    blockers=select(UserBlock.blocker_id).where(UserBlock.blocked_id==user.id)
    active=and_(UserBan.active.is_(True),or_(UserBan.expires_at.is_(None),UserBan.expires_at>datetime.now(timezone.utc)))
    # Match active_ban's shared-device restriction without one lookup per author.
    device_owners=select(UserBan.user_id).where(active,UserBan.ban_type=='device')
    device_hashes=select(UserBrowserDevice.device_hash).where(UserBrowserDevice.user_id.in_(device_owners))
    device_users=select(UserBrowserDevice.user_id).where(UserBrowserDevice.device_hash.in_(device_hashes))
    return select(SocialPost,User,SocialPost.image_bytes.is_not(None).label('has_media')).join(User,User.id==SocialPost.user_id).where(
        User.is_active.is_(True),SocialPost.is_hidden.is_(False),
        ~SocialPost.user_id.in_(blocked),~SocialPost.user_id.in_(blockers),
        ~SocialPost.user_id.in_(select(UserBan.user_id).where(active)),~SocialPost.user_id.in_(device_users),
        or_(SocialPost.user_id==user.id,SocialPost.audience=='public',and_(SocialPost.audience=='followers',SocialPost.user_id.in_(follows))))

def encode_cursor(post, anchor, priority, mode, media, q):
    payload=[post.created_at.isoformat(),post.id,anchor,int(priority),mode,media,q]
    return base64.urlsafe_b64encode(json.dumps(payload,separators=(',',':'),ensure_ascii=False).encode()).decode().rstrip('=')

def decode_cursor(value, mode, media, q):
    try:
        stamp,pid,anchor,priority,cm,ct,cq=json.loads(base64.urlsafe_b64decode(value+'='*(-len(value)%4)))
        if (cm,ct,cq)!=(mode,media,q) or type(pid)!=int or pid<1 or type(anchor)!=int or anchor<1 or pid>anchor or priority not in (0,1):raise ValueError()
        stamp=datetime.fromisoformat(stamp)
        return stamp,pid,anchor,priority
    except (ValueError,TypeError,KeyError,OverflowError):raise HTTPException(422,'Sayfa anahtarı geçersiz; akışı yenileyin.')

def serialize(db,rows,user):
    ids=[p.id for p,_,_ in rows]
    likes=dict(db.execute(select(SocialPostLike.post_id,func.count()).where(SocialPostLike.post_id.in_(ids)).group_by(SocialPostLike.post_id)).all())
    comments=dict(db.execute(select(SocialPostComment.post_id,func.count()).where(SocialPostComment.post_id.in_(ids)).group_by(SocialPostComment.post_id)).all())
    liked=set(db.scalars(select(SocialPostLike.post_id).where(SocialPostLike.user_id==user.id,SocialPostLike.post_id.in_(ids))))
    saved=set(db.scalars(select(SavedPost.post_id).where(SavedPost.user_id==user.id,SavedPost.post_id.in_(ids))))
    result=[]
    for p,u,has_media in rows:
        result.append(dict(id=p.id,user_id=u.id,nickname=u.nickname,avatar=u.avatar,avatar_asset=u.avatar_asset,
            caption=p.caption,created_at=p.created_at,updated_at=p.updated_at,has_image=has_media,mime_type=p.mime_type,
            media_kind='video' if (p.mime_type or '').startswith('video/') else 'image',media_url=f'/posts/{p.id}/media' if has_media else None,
            audience=p.audience,is_hidden=False,is_mine=u.id==user.id,is_pinned=bool(p.is_pinned),
            like_count=likes.get(p.id,0),comment_count=comments.get(p.id,0),liked_by_me=p.id in liked,saved_by_me=p.id in saved))
    return result

def feed_page(db,user,mode='for-you',media='all',q='',limit=20,cursor=None,offset=0):
    if not user.is_active:raise HTTPException(403,'Hesap aktif değil.')
    q=q.strip();query=visible_query(user)
    followed=select(UserFollow.following_id).where(UserFollow.follower_id==user.id)
    priority=SocialPost.user_id.in_(followed) if mode=='for-you' else (SocialPost.id<0)
    if mode=='following':query=query.where(or_(SocialPost.user_id==user.id,SocialPost.user_id.in_(followed)))
    if mode=='saved':query=query.where(SocialPost.id.in_(select(SavedPost.post_id).where(SavedPost.user_id==user.id)))
    else:query=query.where(~SocialPost.id.in_(select(HiddenPost.post_id).where(HiddenPost.user_id==user.id)),~SocialPost.user_id.in_(select(MutedAuthor.author_id).where(MutedAuthor.user_id==user.id)))
    if media=='text':query=query.where(SocialPost.image_bytes.is_(None))
    if media=='image':query=query.where(SocialPost.image_bytes.is_not(None),SocialPost.mime_type.like('image/%'))
    if media=='video':query=query.where(SocialPost.image_bytes.is_not(None),SocialPost.mime_type.like('video/%'))
    if q:query=query.where(or_(SocialPost.caption.icontains(q,autoescape=True),User.nickname.icontains(q,autoescape=True)))
    anchor=db.scalar(select(func.max(SocialPost.id))) or 0
    if cursor:
        stamp,pid,anchor,rank=decode_cursor(cursor,mode,media,q)
        older=or_(SocialPost.created_at<stamp,and_(SocialPost.created_at==stamp,SocialPost.id<pid))
        query=query.where(or_(and_(priority==bool(rank),older),priority==False) if mode=='for-you' and rank else and_(priority==False,older))
    query=query.where(SocialPost.id<=anchor).order_by(priority.desc(),SocialPost.created_at.desc(),SocialPost.id.desc())
    rows=list(db.execute(query.offset(offset).limit(limit+1)));has_more=len(rows)>limit;rows=rows[:limit]
    # Priority is based on the same followed-set snapshot used by this request.
    follow_ids=set(db.scalars(followed)) if mode=='for-you' else set()
    next_cursor=encode_cursor(rows[-1][0],anchor,rows[-1][0].user_id in follow_ids,mode,media,q) if has_more and rows else None
    return {'items':serialize(db,rows,user),'next_cursor':next_cursor,'has_more':has_more,'version':VERSION}

def check_ready(app,connection):
    paths=set(app.openapi().get('paths',{}))
    if not {'/v1/explore/feed','/v1/explore/preferences','/v1/explore/posts/{pid}/saved','/v1/explore/posts/{pid}/hidden','/v1/explore/authors/{uid}/muted'}.issubset(paths):raise RuntimeError('Explore API routes are missing')
    for model in (SavedPost,HiddenPost,MutedAuthor):connection.execute(select(model).limit(0))

def register_auth(current_user, access):
    router=APIRouter(prefix='/v1/explore',tags=['explore-workspace'])
    def private(response:Response):response.headers['Cache-Control']='private, no-store';response.headers['Vary']='Authorization'
    router.dependencies.append(Depends(private))
    @router.get('/feed')
    def feed(mode:str=Query('for-you',pattern='^(for-you|following|recent|saved)$'),media:str=Query('all',pattern='^(all|text|image|video)$'),q:str=Query('',max_length=100),limit:int=Query(20,ge=1,le=50),cursor:str|None=Query(None,max_length=4096),db:Session=Depends(get_db),user:User=Depends(current_user)):
        return feed_page(db,user,mode,media,q,limit,cursor)
    @router.get('/readiness')
    def readiness(db:Session=Depends(get_db),user:User=Depends(current_user)):
        for model in (SavedPost,HiddenPost,MutedAuthor):db.execute(select(model).limit(0))
        return {'version':VERSION,'ready':True}
    def ensure_user(user):
        if not user.is_active:raise HTTPException(403,'Hesap aktif değil.')
    def change(db,user,model,key,enabled):
        ensure_user(user)
        ident=(user.id,key);row=db.get(model,ident)
        if enabled and not row:
            db.add(model(**{'user_id':user.id,('author_id' if model is MutedAuthor else 'post_id'):key}))
            try:db.commit()
            except IntegrityError:
                db.rollback()
                if not db.get(model,ident):raise
        elif not enabled and row:db.delete(row);db.commit()
        return {'active':enabled}
    @router.put('/posts/{pid}/saved')
    def save(pid:int,db:Session=Depends(get_db),user:User=Depends(current_user)):
        ensure_user(user);access(db,pid,user);return change(db,user,SavedPost,pid,True)
    @router.delete('/posts/{pid}/saved')
    def unsave(pid:int,db:Session=Depends(get_db),user:User=Depends(current_user)):
        return change(db,user,SavedPost,pid,False)
    @router.put('/posts/{pid}/hidden')
    def hide(pid:int,db:Session=Depends(get_db),user:User=Depends(current_user)):
        ensure_user(user);post=access(db,pid,user)
        if post.user_id==user.id:raise HTTPException(400,'Kendi gönderinizi profilinden yönetin.')
        return change(db,user,HiddenPost,pid,True)
    @router.delete('/posts/{pid}/hidden')
    def unhide(pid:int,db:Session=Depends(get_db),user:User=Depends(current_user)):
        return change(db,user,HiddenPost,pid,False)
    @router.put('/authors/{uid}/muted')
    def mute(uid:str,db:Session=Depends(get_db),user:User=Depends(current_user)):
        ensure_user(user)
        if uid==user.id:raise HTTPException(400,'Kendinizi sessize alamazsınız.')
        target=db.get(User,uid)
        blocked=db.scalar(select(UserBlock.id).where(or_(and_(UserBlock.blocker_id==user.id,UserBlock.blocked_id==uid),and_(UserBlock.blocker_id==uid,UserBlock.blocked_id==user.id))))
        if not target or not target.is_active or blocked:raise HTTPException(404,'Kullanıcı bulunamadı.')
        return change(db,user,MutedAuthor,uid,True)
    @router.delete('/authors/{uid}/muted')
    def unmute(uid:str,db:Session=Depends(get_db),user:User=Depends(current_user)):
        return change(db,user,MutedAuthor,uid,False)
    @router.get('/preferences')
    def preferences(limit:int=Query(20,ge=1,le=50),offset:int=Query(0,ge=0),db:Session=Depends(get_db),user:User=Depends(current_user)):
        ensure_user(user)
        hidden=list(db.execute(select(HiddenPost.post_id,HiddenPost.created_at).where(HiddenPost.user_id==user.id).order_by(HiddenPost.created_at.desc(),HiddenPost.post_id.desc()).offset(offset).limit(limit+1)))
        # Only names of currently visible, nonblocked accounts; raw IDs already owned by this user's preference.
        block=select(UserBlock.blocked_id).where(UserBlock.blocker_id==user.id)
        blockers=select(UserBlock.blocker_id).where(UserBlock.blocked_id==user.id)
        muted=list(db.execute(select(MutedAuthor.author_id,User.nickname).join(User,User.id==MutedAuthor.author_id).where(MutedAuthor.user_id==user.id,User.is_active.is_(True),~User.id.in_(block),~User.id.in_(blockers)).order_by(MutedAuthor.created_at.desc(),MutedAuthor.author_id).offset(offset).limit(limit+1)))
        return {'hidden':[{'post_id':pid} for pid,_ in hidden[:limit]],'muted':[{'user_id':uid,'nickname':name} for uid,name in muted[:limit]],'has_more':len(hidden)>limit or len(muted)>limit,'next_offset':offset+limit}
    return router
