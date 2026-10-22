"""Owner-only session visibility and revocation; never returns bearer credentials."""
from datetime import datetime,timezone
from fastapi import APIRouter,Depends,Header,HTTPException
from sqlalchemy import select,delete
from sqlalchemy.orm import Session
from .db import get_db
from .models import User
from .session import UserSession,hash_token
router=APIRouter(prefix='/v1/me/security',tags=['account security'])

def register_auth(current_user):
    @router.get('/sessions')
    def sessions(authorization:str=Header(...),db:Session=Depends(get_db),user:User=Depends(current_user)):
        current=hash_token(authorization.split(' ',1)[1].strip())
        rows=db.scalars(select(UserSession).where(UserSession.user_id==user.id,UserSession.expires_at>datetime.now(timezone.utc)).order_by(UserSession.expires_at.desc()).limit(51)).all()
        return {'items':[{'id':row.token_hash,'expires_at':row.expires_at,'current':row.token_hash==current} for row in rows[:50]],'has_more':len(rows)>50}
    @router.delete('/sessions/others')
    def revoke_others(authorization:str=Header(...),db:Session=Depends(get_db),user:User=Depends(current_user)):
        current=hash_token(authorization.split(' ',1)[1].strip())
        result=db.execute(delete(UserSession).where(UserSession.user_id==user.id,UserSession.token_hash!=current));db.commit()
        return {'revoked':int(result.rowcount or 0),'current_preserved':True}
    @router.delete('/sessions/{session_id}')
    def revoke_one(session_id:str,db:Session=Depends(get_db),user:User=Depends(current_user)):
        if len(session_id)!=64 or any(c not in '0123456789abcdef' for c in session_id):raise HTTPException(404,'Oturum bulunamadı.')
        result=db.execute(delete(UserSession).where(UserSession.user_id==user.id,UserSession.token_hash==session_id));db.commit()
        if not result.rowcount:raise HTTPException(404,'Oturum bulunamadı.')
        return {'revoked':True}
    return router
