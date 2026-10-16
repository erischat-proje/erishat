import ast,pathlib,unittest
from datetime import datetime,timezone
from types import SimpleNamespace
from sqlalchemy import create_engine,Column,String,DateTime,select,or_
from sqlalchemy.orm import declarative_base,Session
Base=declarative_base()
class User(Base):
 __tablename__='users';id=Column(String,primary_key=True)
class DirectCall(Base):
 __tablename__='direct_calls';id=Column(String,primary_key=True);caller_id=Column(String);callee_id=Column(String);created_at=Column(DateTime);touched_at=Column(DateTime);accepted_at=Column(DateTime)
class DirectCallHistoryHidden(Base):
 __tablename__='direct_call_history_hidden';user_id=Column(String,primary_key=True);call_id=Column(String,primary_key=True)
source=pathlib.Path(__file__).resolve().parents[1]/'backend/app/call_routes.py';tree=ast.parse(source.read_text());fns=[x for x in tree.body if isinstance(x,ast.FunctionDef) and x.name in ('history_rows','clear_call_history','call_history')]
for fn in fns:
 fn.decorator_list=[];fn.returns=None
 for arg in fn.args.args:arg.annotation=None
 if fn.name!='history_rows':fn.args.defaults=[]
scope=dict(select=select,or_=or_,User=User,DirectCall=DirectCall,DirectCallHistoryHidden=DirectCallHistoryHidden,timezone=timezone,summary=lambda db,c,u:{'id':c.id})
exec(compile(ast.fix_missing_locations(ast.Module(body=fns,type_ignores=[])),'production','exec'),scope)
class HistoryClear(unittest.TestCase):
 def test_user_hidden_admin_retained_new_calls_visible(self):
  e=create_engine('sqlite://');Base.metadata.create_all(e)
  with Session(e) as db:
   now=datetime.now();db.add_all([User(id='a'),User(id='b'),DirectCall(id='old',caller_id='a',callee_id='b',created_at=now,touched_at=now)]);db.commit()
   self.assertEqual(len(scope['call_history'](db,SimpleNamespace(id='a'))),1)
   self.assertEqual(scope['clear_call_history'](db,SimpleNamespace(id='a'))['hidden_count'],1)
   self.assertEqual(scope['call_history'](db,SimpleNamespace(id='a')),[])
   self.assertEqual(len(scope['history_rows'](db,'a')),1) # DA uses unfiltered history_rows.
   self.assertEqual(len(scope['call_history'](db,SimpleNamespace(id='b'))),1)
   self.assertEqual(scope['clear_call_history'](db,SimpleNamespace(id='a'))['hidden_count'],0)
   db.add(DirectCall(id='new',caller_id='b',callee_id='a',created_at=now,touched_at=now));db.commit()
   self.assertEqual([x['id'] for x in scope['call_history'](db,SimpleNamespace(id='a'))],['new'])
   self.assertEqual(len(scope['history_rows'](db,'a')),2)
 def test_da_role_gate_unchanged(self):
  fn=next(x for x in tree.body if isinstance(x,ast.FunctionDef) and x.name=='admin_call_history')
  self.assertIn("role.role != 'DA'",ast.unparse(fn));self.assertIn('history_rows(db, target.id)',ast.unparse(fn))
if __name__=='__main__':unittest.main()
