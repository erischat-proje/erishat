"""Real SQLite uniqueness checks for the extracted production migration."""
import ast,importlib.util,sys,types,unittest
from pathlib import Path
from sqlalchemy import create_engine,select,func,Column,String
from sqlalchemy.orm import DeclarativeBase,Session
from fastapi import HTTPException
ROOT=Path(__file__).resolve().parents[1]
class Base(DeclarativeBase):pass
class User(Base):
 __tablename__='users'
 id=Column(String,primary_key=True)
package=types.ModuleType('seatfixture');package.__path__=[];sys.modules['seatfixture']=package
dbmodule=types.ModuleType('seatfixture.db');dbmodule.Base=Base;sys.modules['seatfixture.db']=dbmodule
spec=importlib.util.spec_from_file_location('seatfixture.room_models',ROOT/'backend/app/room_models.py');models=importlib.util.module_from_spec(spec);spec.loader.exec_module(models)
tree=ast.parse((ROOT/'backend/app/room_routes.py').read_text());nodes=[n for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='LEVELS' for t in n.targets) or isinstance(n,ast.FunctionDef) and n.name=='ensure_seats']
ns=dict(Session=Session,Room=models.Room,RoomSeat=models.RoomSeat,select=select,seat_workflow=types.SimpleNamespace(lock_room=lambda db,room:room))
exec(compile(ast.Module(body=nodes,type_ignores=[]),'production-seat-functions','exec'),ns)
endpoint=next(n for n in ast.walk(tree) if isinstance(n,ast.FunctionDef) and n.name=='set_seat_count')
endpoint.decorator_list=[]
for arg in endpoint.args.args:arg.annotation=None
endpoint.args.defaults=[]
ns.update(HTTPException=HTTPException,require_staff=lambda db,room,user:None,get_room_or_404=lambda db,rid:db.get(models.Room,rid),func=func)
exec(compile(ast.Module(body=[endpoint],type_ignores=[]),'production-seat-endpoint','exec'),ns)
class SeatTests(unittest.TestCase):
 def setUp(self):
  self.engine=create_engine('sqlite://');Base.metadata.create_all(self.engine);self.db=Session(self.engine)
  self.db.add_all(User(id=str(i)) for i in range(30));self.db.commit()
 def tearDown(self):self.db.close();self.engine.dispose()
 def room(self,level,count,version=2):
  r=models.Room(id='r',public_id='123456789012',owner_id='0',name='test',level=level,seat_count=count,seat_layout_version=version);self.db.add(r);self.db.commit();return r
 def seats(self,r,count,occupied=()):
  for n in range(1,count+1):self.db.add(models.RoomSeat(room_id=r.id,seat_number=n,user_id=str(n) if n in occupied else None))
  self.db.commit()
 def check(self,r,count):
  ns['ensure_seats'](self.db,r);self.assertEqual(r.seat_count,count);self.assertEqual(r.seat_layout_version,3)
  self.assertEqual(list(self.db.scalars(select(models.RoomSeat.seat_number).order_by(models.RoomSeat.seat_number))),list(range(1,count+1)))
 def test_all_levels(self):self.assertEqual([ns['LEVELS'][n]['seats'] for n in range(1,9)],[12,12,12,12,16,16,16,16])
 def test_new_room_default(self):
  r=models.Room(id='r',public_id='123456789012',owner_id='0',name='new');self.db.add(r);self.db.commit();self.check(r,12)
 def test_old_sixteen_low_level_moves_overflow_without_unique_error(self):
  r=self.room(1,16);self.seats(r,16,(13,14,15,16));self.check(r,12)
  self.assertEqual(set(self.db.scalars(select(models.RoomSeat.user_id).where(models.RoomSeat.user_id.is_not(None)))),{'13','14','15','16'})
  self.check(r,12)
 def test_full_room_overflow_stays_listener(self):
  r=self.room(4,16);self.seats(r,16,range(1,17));self.check(r,12)
  self.assertEqual(self.db.scalar(select(func.count(User.id))),30)
  self.assertEqual(self.db.scalar(select(func.count(models.RoomSeat.id)).where(models.RoomSeat.user_id.is_not(None))),12)
 def test_old_twentyfour_high_level(self):
  r=self.room(8,24);self.seats(r,24,(22,23,24));self.check(r,16)
 def test_explicit_twelve_stays_after_level_five(self):
  r=self.room(5,12,3);self.seats(r,12);self.check(r,12)
 def test_old_version_one(self):
  r=self.room(1,12,1);self.seats(r,12);self.check(r,12)
 def test_server_rejects_sixteen_before_level_five(self):
  r=self.room(4,12,3);self.seats(r,12)
  with self.assertRaises(HTTPException) as error:ns['set_seat_count']('r',types.SimpleNamespace(seat_count=16),self.db,None)
  self.assertEqual(error.exception.status_code,422);self.check(r,12)
 def test_server_accepts_sixteen_at_level_five_and_rejects_twenty(self):
  r=self.room(5,12,3);self.seats(r,12)
  self.assertEqual(ns['set_seat_count']('r',types.SimpleNamespace(seat_count=16),self.db,None),{'seat_count':16});self.check(r,16)
  for count in [20,24,0,13]:
   with self.assertRaises(HTTPException):ns['set_seat_count']('r',types.SimpleNamespace(seat_count=count),self.db,None)
 def test_cannot_manually_remove_occupied_seats(self):
  r=self.room(5,16,3);self.seats(r,16,(16,))
  with self.assertRaises(HTTPException) as error:ns['set_seat_count']('r',types.SimpleNamespace(seat_count=12),self.db,None)
  self.assertEqual(error.exception.status_code,409);self.check(r,16)
if __name__=='__main__':unittest.main()
