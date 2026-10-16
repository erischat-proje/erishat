"""Execute the production privacy endpoints against an isolated SQLite database."""
import ast, pathlib, re, unittest
from datetime import datetime
from types import SimpleNamespace
from sqlalchemy import create_engine, Column, String, Integer, Boolean, ForeignKey, DateTime, func, select
from sqlalchemy.orm import declarative_base, Session, Mapped, mapped_column
from pydantic import BaseModel
Base=declarative_base()
class User(Base):
    __tablename__='users'
    id=Column(String,primary_key=True)
    notifications_enabled=Column(Boolean,default=True)
class RoomGiftEvent(Base):
    __tablename__='room_gifts'
    id=Column(Integer,primary_key=True);sender_id=Column(String);recipient_id=Column(String);gift_key=Column(String);quantity=Column(Integer)
class DirectMessageGift(Base):
    __tablename__='dm_gifts'
    id=Column(Integer,primary_key=True);sender_id=Column(String);recipient_id=Column(String);gift_key=Column(String);message_id=Column(String)
class Message(Base):
    __tablename__='messages'
    id=Column(String,primary_key=True);text=Column(String)
class HTTPException(Exception):
    def __init__(self,status_code,detail):self.status_code=status_code;self.detail=detail
root=pathlib.Path(__file__).resolve().parents[1]/'backend/app'
scope=dict(Base=Base,Mapped=Mapped,mapped_column=mapped_column,String=String,Boolean=Boolean,ForeignKey=ForeignKey,DateTime=DateTime,datetime=datetime,func=func,BaseModel=BaseModel,User=User,HTTPException=HTTPException,select=select,RoomGiftEvent=RoomGiftEvent,DirectMessageGift=DirectMessageGift,Message=Message,re=re,GIFT_META={},active_ban=lambda *_:False,fan_leaderboard=lambda *_:[{'rank':1,'user_id':'sender','total_lidya':900,'fan_level':2}])
def extract(file,names,kind=ast.FunctionDef):
    tree=ast.parse((root/file).read_text())
    nodes=[x for x in ast.walk(tree) if isinstance(x,kind) and x.name in names]
    for node in nodes:
        if isinstance(node,ast.FunctionDef):
            node.decorator_list=[];node.returns=None;node.args.defaults=[]
            for arg in node.args.args:arg.annotation=None
    exec(compile(ast.fix_missing_locations(ast.Module(body=nodes,type_ignores=[])),file,'exec'),scope)
extract('platform_models.py',{'UserPrivacy','UserSocialPrivacy'},ast.ClassDef)
extract('platform_routes.py',{'PrivacyUpdate'},ast.ClassDef)
extract('social_privacy.py',{'social_flags','require_social_visible'})
extract('platform_routes.py',{'get_privacy_auth','update_privacy'})
extract('main.py',{'personal_fan_leaderboard','received_gifts'})
def privacy_row(db,uid):
    p=db.get(scope['UserPrivacy'],uid)
    if p is None:p=scope['UserPrivacy'](user_id=uid);db.add(p);db.flush()
    return p
scope['privacy_row']=privacy_row
class VisibilityTest(unittest.TestCase):
    def test_saved_flags_owner_and_other_viewer(self):
        engine=create_engine('sqlite://');Base.metadata.create_all(engine)
        with Session(engine) as db:
            owner=User(id='owner');other=User(id='other');db.add_all([owner,other,RoomGiftEvent(sender_id='sender',recipient_id='owner',gift_key='rose',quantity=3)]);db.commit()
            self.assertFalse(scope['get_privacy_auth'](db,owner)['hide_fans'])
            update=scope['update_privacy'];Payload=scope['PrivacyUpdate'];flags=scope['social_flags'];rank=scope['personal_fan_leaderboard'];gifts=scope['received_gifts']
            update(Payload(hide_fans=True,hide_received_gifts=True,hide_notifications=True),db,owner)
            db.expire_all()
            saved=scope['get_privacy_auth'](db,owner)
            self.assertTrue(saved['hide_fans']);self.assertTrue(saved['hide_received_gifts']);self.assertFalse(owner.notifications_enabled)
            self.assertEqual(flags(db,'owner','owner'),{'fans_hidden':False,'gifts_hidden':False})
            for call in [lambda:rank('owner',db,other),lambda:gifts('owner',None,db,other),lambda:gifts('owner','sender',db,other)]:
                with self.assertRaises(HTTPException) as caught:call()
                self.assertEqual(caught.exception.status_code,403)
            self.assertEqual(gifts('owner','sender',db,owner)[0]['count'],3)
            self.assertEqual(rank('owner',db,owner)[0]['total_lidya'],900)
            update(Payload(hide_fans=False),db,owner)
            public_rank=rank('owner',db,other)[0]
            self.assertTrue(public_rank['gifts_hidden']);self.assertNotIn('total_lidya',public_rank);self.assertNotIn('fan_level',public_rank)
            update(Payload(hide_received_gifts=False,hide_fans=True),db,owner)
            self.assertEqual(gifts('owner',None,db,other)[0]['count'],3)
            with self.assertRaises(HTTPException):gifts('owner','sender',db,other)
            update(Payload(hide_fans=False,hide_notifications=False,hide_vip=True),db,owner)
            saved=scope['get_privacy_auth'](db,owner)
            self.assertTrue(all(saved[k] for k in ('hide_vip','hide_vip_badge','hide_vip_neon','hide_vip_entry','hide_vip_title')))
            self.assertEqual(gifts('owner','sender',db,other)[0]['count'],3)
            self.assertTrue(owner.notifications_enabled)
            self.assertFalse(scope['get_privacy_auth'](db,other)['hide_fans'])
if __name__=='__main__':unittest.main()
