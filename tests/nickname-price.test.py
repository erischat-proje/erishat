"""Exercise the production endpoint body against a real SQLite transaction."""
import ast, pathlib, types, sys, unittest
from sqlalchemy import create_engine, Column, Integer, String, func, text
from sqlalchemy.orm import declarative_base, Session
from fastapi import HTTPException
Base=declarative_base()
class User(Base):
    __tablename__='users'
    id=Column(String,primary_key=True)
    nickname=Column(String)
    lidya=Column(Integer)
class Receipt(Base):
    __tablename__='receipts'
    id=Column(Integer,primary_key=True)
    uid=Column(String)
    amount=Column(Integer)
module=types.ModuleType('fixture.vip_spending')
def spend(db,uid,amount,source):
    assert source=='nickname'
    db.add(Receipt(uid=uid,amount=amount))
module.record_spend=spend
sys.modules['fixture.vip_spending']=module
root=pathlib.Path(__file__).resolve().parents[1]
tree=ast.parse((root/'backend/app/main.py').read_text())
fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='change_nickname')
fn.decorator_list=[];fn.returns=None;fn.args.defaults=[]
for arg in fn.args.args:arg.annotation=None
scope=dict(__package__='fixture',User=User,HTTPException=HTTPException,func=func,text=text)
exec(compile(ast.Module(body=[fn],type_ignores=[]),'endpoint','exec'),scope)
change=scope['change_nickname']
class Tests(unittest.TestCase):
    def setUp(self):
        self.engine=create_engine('sqlite://');Base.metadata.create_all(self.engine);self.db=Session(self.engine)
        self.db.add_all([User(id='a',nickname='Old',lidya=500),User(id='b',nickname='Taken',lidya=100)]);self.db.commit();self.user=self.db.get(User,'a')
    def tearDown(self):self.db.close();self.engine.dispose()
    def call(self,name):return change(types.SimpleNamespace(nickname=name),self.db,self.user)
    def test_price_and_repeat(self):
        self.call(' New ');self.assertEqual(self.user.nickname,'New');self.assertEqual(self.user.lidya,350)
        self.call('New');self.assertEqual(self.user.lidya,350);self.assertEqual(self.db.query(Receipt).count(),1);self.assertEqual(self.db.query(Receipt).one().amount,150)
    def test_collision_no_charge(self):
        with self.assertRaises(HTTPException) as e:self.call('taken')
        self.assertEqual(e.exception.status_code,409);self.assertEqual(self.user.lidya,500);self.assertEqual(self.db.query(Receipt).count(),0)
    def test_insufficient_no_change(self):
        self.user.lidya=149;self.db.commit()
        with self.assertRaises(HTTPException):self.call('New')
        self.assertEqual(self.user.nickname,'Old');self.assertEqual(self.user.lidya,149)
    def test_same_name_no_charge(self):
        self.call('Old');self.assertEqual(self.user.lidya,500)
    def test_empty(self):
        with self.assertRaises(HTTPException):self.call('  ')
        self.assertEqual(self.user.lidya,500)
if __name__=='__main__':unittest.main()
