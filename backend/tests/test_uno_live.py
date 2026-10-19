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
    lidya:Mapped[int]=mapped_column(Integer,default=1000)
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
            self.db.add(User(id=f'u{n}',nickname=f'P{n}',lidya=1000));self.db.add(RoomSeat(room_id='r1',seat_number=n,user_id=f'u{n}'))
        self.db.add(User(id='watcher',nickname='Watcher',lidya=1000));self.db.add(User(id='outsider',nickname='Outsider',lidya=1000));self.db.commit();self.seq=0
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

class UnoMoney(unittest.TestCase):
    setUp = UnoAPI.setUp
    tearDown = UnoAPI.tearDown
    act = UnoAPI.act
    setup_game = UnoAPI.setup_game
    def balance(self, uid):
        self.db.expire_all()
        return self.db.get(User, uid).lidya
    def state(self):
        return json.loads(self.db.get(live.RoomUno, 'r1').state_json)
    def win(self, seat=1):
        # End a real hand through the engine, then settle in the API transaction.
        row=self.db.get(live.RoomUno,'r1');s=json.loads(row.state_json)
        c=next(c['id'] for c in u.CARDS if c['color']=='red' and c['value']=='1')
        for p in s['players']:
            p['hand']=[c] if p['seat']==seat else [next(x['id'] for x in u.CARDS if x['color']=='blue' and x['value']==str(p['seat']))]
        s.update(turn=seat,phase='play',discard=[9],active_color='red',deadline=9999999999,uno_vulnerable=None)
        live.save(row,s);self.db.commit()
        return self.act('play','u'+str(seat),card=c)
    def test_ready_charges_once_and_withdraw_refunds(self):
        self.act('create',stake=100);self.act('ready',stake=100)
        self.assertEqual(self.balance('u1'),900)
        self.act('ready',stake=100);self.assertEqual(self.balance('u1'),900)
        self.act('withdraw');self.assertEqual(self.balance('u1'),1000);self.assertEqual(self.state()['pool'],0)
    def test_insufficient_funds_no_partial_charge(self):
        self.act('create',stake=300);self.db.get(User,'u1').lidya=100;self.db.commit()
        with self.assertRaises(HTTPException):self.act('ready',stake=300)
        self.db.rollback();self.assertEqual(self.balance('u1'),100);self.assertEqual(self.state()['players'],[])
    def test_stale_bet_and_invalid_denomination_rejected(self):
        self.act('create',stake=100)
        with self.assertRaises(HTTPException):self.act('ready',stake=50)
        self.db.rollback();self.assertEqual(self.balance('u1'),1000)
        with self.assertRaises(HTTPException):self.act('configure',stake=75)
        self.db.rollback();self.assertEqual(self.state()['stake'],100)
    def test_settings_lock_once_anyone_ready(self):
        self.act('create');self.act('configure',stake=200,mode='paired');self.act('ready',stake=200)
        with self.assertRaises(HTTPException):self.act('configure',stake=300)
        self.db.rollback();self.assertEqual(self.state()['stake'],200);self.assertEqual(self.balance('u1'),800)
    def test_cancel_refunds_every_player_once(self):
        self.setup_game(3);self.act('close')
        self.assertTrue(self.state()['refunded'])
        self.act('close')
        for uid in ('u1','u2','u3'):self.assertEqual(self.balance(uid),1000)
    def test_solo_payout_and_close_do_not_double_pay(self):
        self.setup_game(3);self.win()
        self.assertEqual(self.balance('u1'),1100);self.assertEqual(self.balance('u2'),950);self.assertEqual(self.balance('u3'),950)
        self.assertEqual(self.state()['payouts'],{'1':150})
        self.act('close');self.assertEqual(self.balance('u1'),1100)
    def test_paired_equal_split(self):
        self.setup_game(4,'paired');self.win()
        self.assertEqual(self.balance('u1'),1050);self.assertEqual(self.balance('u3'),1050)
        self.assertEqual(self.balance('u2'),950);self.assertEqual(self.balance('u4'),950)
        self.assertEqual(self.state()['payouts'],{'1':100,'3':100})
    def test_between_hands_holds_escrow_then_refunds_cancel(self):
        self.act('create',victory='points');self.act('ready');self.act('ready','u2');self.act('start');self.win()
        self.assertEqual(self.state()['status'],'hand_finished');self.assertEqual(self.balance('u1'),950)
        self.act('next_hand');self.assertEqual(self.balance('u1'),950)
        self.act('close');self.assertEqual(self.balance('u1'),1000);self.assertEqual(self.balance('u2'),1000)
    def test_lobby_absence_and_expiry_refunds(self):
        self.act('create');self.act('ready');self.act('ready','u2')
        seat=self.db.query(RoomSeat).filter_by(user_id='u2').one();seat.user_id='';self.db.commit()
        live.tick_room('r1',1);self.db.expire_all();self.assertEqual(self.balance('u2'),1000);self.assertEqual(self.state()['pool'],50)
        live.tick_room('r1',9999999999);self.db.expire_all();self.assertEqual(self.balance('u1'),1000)
    def test_new_bet_repeated_request_does_not_charge_twice(self):
        self.act('create');s=self.state()
        p=live.Action(action='ready',stake=50,round_id=s['round_id'],version=s['version'],request_key='ready-repeat-money-key')
        live.mutate('r1',p,self.db,self.db.get(User,'u1'));live.mutate('r1',p,self.db,self.db.get(User,'u1'))
        self.assertEqual(self.balance('u1'),950)
    def test_close_shared_house_refund(self):
        self.setup_game(2);old=rooms.couple_gifts
        rooms.couple_gifts=types.SimpleNamespace(room_house=lambda *a:types.SimpleNamespace(active=False))
        try:live.tick_room('r1',1)
        finally:rooms.couple_gifts=old
        self.db.expire_all();self.assertEqual(self.balance('u1'),1000);self.assertEqual(self.balance('u2'),1000)
    def test_worker_finishes_and_pays_once(self):
        self.setup_game(2)
        row=self.db.get(live.RoomUno,'r1');s=json.loads(row.state_json)
        c=next(c['id'] for c in u.CARDS if c['color']=='red' and c['value']=='1')
        s['players'][0].update(hand=[c],bot=True,disconnected_at=0)
        s.update(turn=1,phase='play',discard=[9],active_color='red',deadline=120)
        live.save(row,s);seat=self.db.query(RoomSeat).filter_by(user_id='u1').one();seat.user_id='';self.db.commit()
        live.tick_room('r1',103);self.db.expire_all()
        self.assertEqual(self.state()['status'],'finished');self.assertEqual(self.balance('u1'),1050)
        live.tick_room('r1',104);self.assertEqual(self.balance('u1'),1050)
    def test_points_match_pays_only_at_500(self):
        self.act('create',victory='points');self.act('ready');self.act('ready','u2');self.act('start')
        row=self.db.get(live.RoomUno,'r1');s=json.loads(row.state_json);s['scores']['1']=499;live.save(row,s);self.db.commit()
        self.win();self.assertEqual(self.state()['status'],'finished');self.assertEqual(self.balance('u1'),1050)
    def test_single_spectator_snapshot_has_shared_table_no_hands(self):
        self.setup_game(3)
        v=live.snapshot('r1',self.db,self.db.get(User,'watcher'))
        self.assertEqual(v['state']['stake'],50);self.assertEqual(v['state']['pool'],150)
        self.assertTrue(all('hand' not in p for p in v['state']['players']))

if __name__=='__main__':unittest.main()
