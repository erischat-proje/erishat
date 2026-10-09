"""Exercise real UNO SQL models/actions with isolated SQLite room dependencies.
PostgreSQL row-lock concurrency and production auth are not emulated here.
"""
import importlib.util
import json
from pathlib import Path
import sys
import types
import unittest
from sqlalchemy import create_engine, String, Integer
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from fastapi import HTTPException

ROOT=Path(__file__).parents[1]/'app'
pkg=types.ModuleType('uno_test_app');pkg.__path__=[str(ROOT)];sys.modules[pkg.__name__]=pkg
class Base(DeclarativeBase):pass
class User(Base):
    __tablename__='users'
    id:Mapped[str]=mapped_column(String,primary_key=True)
    nickname:Mapped[str]=mapped_column(String)
class Room(Base):
    __tablename__='rooms'
    id:Mapped[str]=mapped_column(String,primary_key=True)
class RoomSeat(Base):
    __tablename__='room_seats'
    id:Mapped[int]=mapped_column(Integer,primary_key=True)
    room_id:Mapped[str]=mapped_column(String)
    seat_number:Mapped[int]=mapped_column(Integer)
    user_id:Mapped[str]=mapped_column(String)
engine=create_engine('sqlite:///:memory:')
SessionLocal=sessionmaker(bind=engine,expire_on_commit=False)
def module(name,**attrs):
    m=types.ModuleType(pkg.__name__+'.'+name);m.__dict__.update(attrs);sys.modules[m.__name__]=m;return m
module('db',Base=Base,SessionLocal=SessionLocal,get_db=lambda:None)
module('models',User=User)
module('room_models',Room=Room,RoomSeat=RoomSeat)
MEMBERS={'u1','u2','u3','u4','watcher'}
def staff(db,r,u):
    if u.id!='watcher':raise HTTPException(403,'No staff')
rooms=module('room_routes',current_user_dependency=lambda:None,get_room_or_404=lambda db,rid:db.get(Room,rid),
             is_member=lambda db,rid,uid:uid in MEMBERS,ghost_active=lambda db,uid:False,
             reject_ghost=lambda *a:None,require_staff=staff,require_owner=staff,
             couple_gifts=types.SimpleNamespace(room_house=lambda *a:None))
class RoomLudo(Base):
    __tablename__='room_ludo'
    room_id:Mapped[str]=mapped_column(String,primary_key=True)
    status:Mapped[str]=mapped_column(String)
class RoomOkey101(Base):
    __tablename__='room_okey'
    room_id:Mapped[str]=mapped_column(String,primary_key=True)
    status:Mapped[str]=mapped_column(String)
module('ludo_live',RoomLudo=RoomLudo);module('okey101_live',RoomOkey101=RoomOkey101)
import importlib
live=importlib.import_module(pkg.__name__+'.uno_live')
u=importlib.import_module(pkg.__name__+'.uno_engine')

class UnoAPI(unittest.TestCase):
    def setUp(self):
        Base.metadata.drop_all(engine);Base.metadata.create_all(engine)
        self.db=SessionLocal();self.db.add(Room(id='r1'));self.db.add(Room(id='r2'))
        for n in range(1,5):
            self.db.add(User(id=f'u{n}',nickname=f'P{n}'));self.db.add(RoomSeat(room_id='r1',seat_number=n,user_id=f'u{n}'))
        self.db.add(User(id='watcher',nickname='Watcher'));self.db.add(User(id='outsider',nickname='Outsider'));self.db.commit();self.seq=0
    def tearDown(self):self.db.close()
    def act(self,action,uid='u1',**extra):
        self.seq+=1;row=self.db.get(live.RoomUno,'r1');s=json.loads(row.state_json) if row else {}
        p=live.Action(action=action,round_id=s.get('round_id',''),version=s.get('version',0),request_key=f'request-{self.seq:016}',**extra)
        return live.mutate('r1',p,self.db,self.db.get(User,uid))
    def setup_game(self,n=3,mode='solo'):
        self.act('create',mode=mode)
        for i in range(1,n+1):self.act('ready',f'u{i}')
        return self.act('start')
    def test_lobby_start_and_persistence(self):
        self.setup_game();self.db.close();self.db=SessionLocal()
        row=self.db.get(live.RoomUno,'r1');self.assertEqual(row.status,'playing')
        v=live.snapshot('r1',self.db,self.db.get(User,'watcher'))
        self.assertTrue(all('hand' not in p for p in v['state']['players']))
        self.assertIsNone(live.snapshot('r2',self.db,self.db.get(User,'u1'))['state'])
    def test_member_gate(self):
        with self.assertRaises(HTTPException) as e:live.snapshot('r1',self.db,self.db.get(User,'outsider'))
        self.assertEqual(e.exception.status_code,403)
    def test_spectator_cannot_join_or_play(self):
        self.act('create')
        with self.assertRaises(HTTPException):self.act('ready','watcher')
        self.db.rollback();self.act('ready');self.act('ready','u2');self.act('start')
        with self.assertRaises(HTTPException):self.act('draw','watcher')
    def test_duplicate_request_exactly_once(self):
        self.act('create');self.act('ready');self.act('ready','u2')
        row=self.db.get(live.RoomUno,'r1');s=json.loads(row.state_json)
        p=live.Action(action='start',round_id=s['round_id'],version=s['version'],request_key='same-request-key-123456')
        a=live.mutate('r1',p,self.db,self.db.get(User,'u1'));b=live.mutate('r1',p,self.db,self.db.get(User,'u1'))
        self.assertEqual(a['state']['version'],b['state']['version']);self.assertEqual(a['state']['hand_no'],1)
    def test_stale_version_rejected(self):
        self.setup_game();row=self.db.get(live.RoomUno,'r1');s=json.loads(row.state_json)
        p=live.Action(action='draw',round_id=s['round_id'],version=0,request_key='stale-request-key-1234')
        with self.assertRaises(HTTPException) as e:live.mutate('r1',p,self.db,self.db.get(User,'u1'))
        self.assertEqual(e.exception.status_code,409)
    def test_other_game_blocks_creation(self):
        self.db.add(RoomLudo(room_id='r1',status='playing'));self.db.commit()
        with self.assertRaises(HTTPException) as e:self.act('create')
        self.assertEqual(e.exception.status_code,409)
    def test_pair_needs_four(self):
        self.act('create',mode='paired');self.act('ready');self.act('ready','u2')
        with self.assertRaises(HTTPException):self.act('start')
        self.db.rollback();self.act('ready','u3');self.act('ready','u4');self.act('start')
    def test_timeout_worker_and_disconnect_recovery(self):
        self.setup_game(2);row=self.db.get(live.RoomUno,'r1');s=json.loads(row.state_json);s.update(phase='play',turn=1,deadline=0);live.save(row,s);self.db.commit()
        live.tick_room('r1',30);self.db.expire_all();s=json.loads(self.db.get(live.RoomUno,'r1').state_json);self.assertEqual(s['turn'],2)
        seat=self.db.query(RoomSeat).filter_by(user_id='u1').one();seat.user_id='';self.db.commit()
        live.tick_room('r1',31);live.tick_room('r1',92);self.db.expire_all();s=json.loads(self.db.get(live.RoomUno,'r1').state_json);self.assertTrue(u.player(s,1)['bot'])
        seat=self.db.query(RoomSeat).filter_by(seat_number=1,room_id='r1').one();seat.user_id='u1';self.db.commit();live.tick_room('r1',93);self.db.expire_all();s=json.loads(self.db.get(live.RoomUno,'r1').state_json);self.assertFalse(u.player(s,1)['bot'])
    def test_close_authorization(self):
        self.setup_game()
        with self.assertRaises(HTTPException):self.act('close','u2')
        self.db.rollback();v=self.act('close');self.assertEqual(v['state']['status'],'closed')
    def test_no_private_state_in_receipt(self):
        self.setup_game();receipt=self.db.query(live.UnoReceipt).first();self.assertFalse(hasattr(receipt,'response_json'))

if __name__=='__main__':unittest.main()
