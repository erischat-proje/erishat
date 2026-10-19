import ast,pathlib,re,unittest
from sqlalchemy import create_engine,Column,String,Integer,select,func
from sqlalchemy.orm import declarative_base,Session
Base=declarative_base()
class User(Base):
 __tablename__='users';id=Column(String,primary_key=True)
class RoomGiftEvent(Base):
 __tablename__='room_gifts';id=Column(Integer,primary_key=True);sender_id=Column(String);recipient_id=Column(String);gift_key=Column(String);quantity=Column(Integer)
class DirectMessageGift(Base):
 __tablename__='dm_gifts';id=Column(Integer,primary_key=True);sender_id=Column(String);recipient_id=Column(String);gift_key=Column(String);message_id=Column(String)
class Message(Base):
 __tablename__='messages';id=Column(String,primary_key=True);text=Column(String)
source=pathlib.Path(__file__).resolve().parents[1]/'backend/app/main.py'
fn=next(x for x in ast.parse(source.read_text()).body if isinstance(x,ast.FunctionDef) and x.name=='received_gifts');fn.decorator_list=[];fn.args.defaults=[]
for arg in fn.args.args:arg.annotation=None
scope=dict(select=select,func=func,User=User,RoomGiftEvent=RoomGiftEvent,DirectMessageGift=DirectMessageGift,Message=Message,re=re,GIFT_META={},active_ban=lambda *_:False)
exec(compile(ast.fix_missing_locations(ast.Module(body=[fn],type_ignores=[])),'endpoint','exec'),scope)
class GiftFilter(unittest.TestCase):
 def test_sender_and_recipient(self):
  engine=create_engine('sqlite://');Base.metadata.create_all(engine)
  with Session(engine) as db:
   db.add_all([User(id='r'),RoomGiftEvent(sender_id='a',recipient_id='r',gift_key='rose',quantity=3),RoomGiftEvent(sender_id='b',recipient_id='r',gift_key='rose',quantity=8),RoomGiftEvent(sender_id='a',recipient_id='other',gift_key='rose',quantity=99),Message(id='m',text='rose ×5'),DirectMessageGift(sender_id='a',recipient_id='r',gift_key='rose',message_id='m')]);db.commit()
   endpoint=scope['received_gifts'];self.assertEqual(endpoint('r','a',db,None)[0]['count'],8);self.assertEqual(endpoint('r',None,db,None)[0]['count'],16);self.assertEqual(endpoint('r','missing',db,None),[])
if __name__=='__main__':unittest.main()
