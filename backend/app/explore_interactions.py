"""Shared comment/story privacy and bounded interaction pages; no schema changes."""
import base64
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select, func, and_, or_
from .db import get_db
from .models import User
from .platform_models import (SocialPostComment as Comment, SocialPostCommentLike as CommentLike,
    UserBlock, UserFollow, SocialStory, SocialStoryView, SocialStoryLike)
from .admin_models import UserBan, AdminRole
from .ban_workflow_models import UserBrowserDevice

def utc(value):return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value

def allowed_authors(viewer):
    active=and_(UserBan.active.is_(True),or_(UserBan.expires_at.is_(None),UserBan.expires_at>datetime.now(timezone.utc)))
    banned=select(UserBan.user_id).where(active)
    owners=select(UserBan.user_id).where(active,UserBan.ban_type=='device')
    devices=select(UserBrowserDevice.device_hash).where(UserBrowserDevice.user_id.in_(owners))
    shared=select(UserBrowserDevice.user_id).where(UserBrowserDevice.device_hash.in_(devices))
    blocks=select(UserBlock.blocked_id).where(UserBlock.blocker_id==viewer.id)
    blockers=select(UserBlock.blocker_id).where(UserBlock.blocked_id==viewer.id)
    return select(User.id).where(User.is_active.is_(True),User.id.not_in(banned),User.id.not_in(shared),User.id.not_in(blocks),User.id.not_in(blockers))

def comments_query(pid,viewer):
    authors=allowed_authors(viewer)
    roots=select(Comment.id).where(Comment.post_id==pid,Comment.parent_id.is_(None),Comment.user_id.in_(authors))
    return select(Comment).where(Comment.post_id==pid,Comment.user_id.in_(authors),or_(Comment.parent_id.is_(None),Comment.parent_id.in_(roots)))

def comment_access(db,pid,cid,viewer):
    row=db.scalar(comments_query(pid,viewer).where(Comment.id==cid))
    if not row:raise HTTPException(404,'Yorum bulunamadı.')
    return row

def comment_rows(db,items,viewer):
    ids=[c.id for c in items]
    if not ids:return []
    authors={u.id:u for u in db.scalars(select(User).where(User.id.in_({c.user_id for c in items})))}
    likes=dict(db.execute(select(CommentLike.comment_id,func.count()).where(CommentLike.comment_id.in_(ids)).group_by(CommentLike.comment_id)).all())
    liked=set(db.scalars(select(CommentLike.comment_id).where(CommentLike.user_id==viewer.id,CommentLike.comment_id.in_(ids))))
    replies=dict(db.execute(select(Comment.parent_id,func.count()).where(Comment.post_id.in_({c.post_id for c in items}),Comment.parent_id.in_(ids),Comment.user_id.in_(allowed_authors(viewer))).group_by(Comment.parent_id)).all())
    return [dict(id=c.id,post_id=c.post_id,parent_id=c.parent_id,user_id=c.user_id,nickname=authors[c.user_id].nickname,
        avatar=authors[c.user_id].avatar,avatar_asset=authors[c.user_id].avatar_asset,gender=authors[c.user_id].gender,
        body=c.body,created_at=c.created_at,is_pinned=c.is_pinned,is_mine=c.user_id==viewer.id,
        liked_by_me=c.id in liked,like_count=likes.get(c.id,0),reply_count=replies.get(c.id,0)) for c in items]

def pack(value):return base64.urlsafe_b64encode(json.dumps(value,separators=(',',':')).encode()).decode().rstrip('=')
def unpack(value,pid,parent,order):
    try:
        p,root,sort,anchor,last,rank=json.loads(base64.b64decode(value+'='*(-len(value)%4),altchars=b'-_',validate=True))
        if (p,root,sort)!=(pid,parent,order) or type(anchor)!=int or type(last)!=int or not 0<last<=anchor<=9223372036854775807 or type(rank)!=int or rank not in (0,1):raise ValueError()
        return anchor,last,rank
    except (ValueError,TypeError,UnicodeError,OverflowError):raise HTTPException(422,'Yorum sayfa anahtarı geçersiz; listeyi yenileyin.')

def comment_page(db,pid,viewer,parent=None,order='newest',limit=20,cursor=None):
    if parent is not None:
        root=comment_access(db,pid,parent,viewer)
        if root.parent_id is not None:raise HTTPException(422,'Yanıt listesi için ana yorumu seçin.')
    query=comments_query(pid,viewer).where(Comment.parent_id==parent if parent is not None else Comment.parent_id.is_(None))
    anchor=db.scalar(select(func.max(Comment.id)).where(Comment.post_id==pid)) or 0
    pinned=Comment.is_pinned if parent is None else (Comment.id<0)
    if cursor:
        anchor,last,rank=unpack(cursor,pid,parent,order)
        older=Comment.id<last if order=='newest' else Comment.id>last
        query=query.where(or_(and_(pinned==bool(rank),older),pinned.is_(False)) if rank else and_(pinned.is_(False),older))
    items=list(db.scalars(query.where(Comment.id<=anchor).order_by(pinned.desc(),Comment.id.desc() if order=='newest' else Comment.id.asc()).limit(limit+1)))
    more=len(items)>limit;items=items[:limit]
    return {'items':comment_rows(db,items,viewer),'has_more':more,
        'next_cursor':pack([pid,parent,order,anchor,items[-1].id,int(items[-1].is_pinned and parent is None)]) if items and more else None}

def visible_story(db,sid,viewer):
    story=db.get(SocialStory,sid)
    if not story or utc(story.expires_at)<=datetime.now(timezone.utc):raise HTTPException(404,'Hikâye bulunamadı veya süresi doldu.')
    if not db.scalar(allowed_authors(viewer).where(User.id==story.user_id)):raise HTTPException(404,'Hikâye bulunamadı.')
    if story.user_id!=viewer.id and not db.scalar(select(UserFollow.id).where(UserFollow.follower_id==viewer.id,UserFollow.following_id==story.user_id)):
        raise HTTPException(404,'Hikâye bulunamadı.')
    return story

def viewer_query(sid,owner):
    ghosts=select(AdminRole.user_id).where(AdminRole.role=='DA',AdminRole.ghost_mode.is_(True))
    return select(SocialStoryView,User).join(User,User.id==SocialStoryView.viewer_id).where(SocialStoryView.story_id==sid,
        SocialStoryView.viewer_id!=owner.id,User.id.in_(allowed_authors(owner)),User.id.not_in(ghosts))

def register_auth(auth,post_access):
    router=APIRouter(prefix='/v1/explore',tags=['explore-interactions'])
    def private(response:Response):response.headers['Cache-Control']='private, no-store';response.headers['Vary']='Authorization'
    router.dependencies.append(Depends(private))
    @router.get('/posts/{pid}/comments')
    def comments(pid:int,parent_id:int|None=Query(None,ge=1),order:str=Query('newest',pattern='^(newest|oldest)$'),limit:int=Query(20,ge=1,le=50),cursor:str|None=Query(None,max_length=512),db=Depends(get_db),viewer=Depends(auth)):
        post_access(db,pid,viewer);return comment_page(db,pid,viewer,parent_id,order,limit,cursor)
    @router.get('/posts/{pid}/comments/{cid}')
    def comment(pid:int,cid:int,db=Depends(get_db),viewer=Depends(auth)):
        post_access(db,pid,viewer);return comment_rows(db,[comment_access(db,pid,cid,viewer)],viewer)[0]
    @router.get('/stories/{sid}/viewers')
    def viewers(sid:int,before:int|None=Query(None,ge=1,le=9223372036854775807),limit:int=Query(20,ge=1,le=50),db=Depends(get_db),viewer=Depends(auth)):
        story=visible_story(db,sid,viewer)
        if story.user_id!=viewer.id:raise HTTPException(403,'Görüntüleyenleri yalnızca hikâye sahibi açabilir.')
        query=viewer_query(sid,viewer)
        if before is not None:query=query.where(SocialStoryView.id<before)
        rows=list(db.execute(query.order_by(SocialStoryView.id.desc()).limit(limit+1)));more=len(rows)>limit;rows=rows[:limit]
        liked=set(db.scalars(select(SocialStoryLike.user_id).where(SocialStoryLike.story_id==sid,SocialStoryLike.user_id.in_([u.id for _,u in rows]))))
        return {'items':[dict(user_id=u.id,nickname=u.nickname,avatar=u.avatar,avatar_asset=u.avatar_asset,viewed_at=v.viewed_at,liked=u.id in liked) for v,u in rows],
            'has_more':more,'next_before':rows[-1][0].id if more else None}
    @router.put('/stories/{sid}/liked')
    def like(sid:int,db=Depends(get_db),viewer=Depends(auth)):
        return story_like(db,sid,viewer,True)
    @router.delete('/stories/{sid}/liked')
    def unlike(sid:int,db=Depends(get_db),viewer=Depends(auth)):
        return story_like(db,sid,viewer,False)
    return router

def story_like(db,sid,viewer,enabled):
    from sqlalchemy.exc import IntegrityError
    from .platform_models import Notification
    story=visible_story(db,sid,viewer);row=db.get(SocialStoryLike,(sid,viewer.id))
    if enabled and not row:
        db.add(SocialStoryLike(story_id=sid,user_id=viewer.id))
        if story.user_id!=viewer.id and db.get(User,story.user_id).notifications_enabled:db.add(Notification(user_id=story.user_id,kind='story_like',title=viewer.nickname,body='Hikâyeni beğendi.'))
        try:db.commit()
        except IntegrityError:
            db.rollback()
            if not db.get(SocialStoryLike,(sid,viewer.id)):raise
    elif not enabled and row:db.delete(row);db.commit()
    return {'liked':enabled,'like_count':int(db.scalar(select(func.count()).select_from(SocialStoryLike).where(SocialStoryLike.story_id==sid)) or 0)}
