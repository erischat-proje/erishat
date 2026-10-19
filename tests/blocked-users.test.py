import ast, pathlib, unittest
from datetime import datetime
from sqlalchemy import create_engine, Column, String, Integer, DateTime, select
from sqlalchemy.orm import declarative_base, Session
Base=declarative_base()
class User(Base):
    __tablename__='users'
    id=Column(String,primary_key=True);nickname=Column(String);avatar_asset=Column(String);frame_asset=Column(String)
class UserBlock(Base):
    __tablename__='user_blocks'
    id=Column(Integer,primary_key=True);blocker_id=Column(String);blocked_id=Column(String);created_at=Column(DateTime,default=datetime.now)
source=pathlib.Path(__file__).resolve().parents[1]/'backend/app/platform_routes.py'
fns=[n for n in ast.walk(ast.parse(source.read_text())) if isinstance(n,ast.FunctionDef) and n.name in {'my_blocks','unblock_user'}]
for fn in fns:
    fn.decorator_list=[];fn.args.defaults=[];fn.returns=None
    for arg in fn.args.args:arg.annotation=None
scope=dict(User=User,UserBlock=UserBlock,select=select)
exec(compile(ast.fix_missing_locations(ast.Module(body=fns,type_ignores=[])),'production','exec'),scope)
class BlocksTest(unittest.TestCase):
    def test_only_own_blocks_and_delete(self):
        engine=create_engine('sqlite://');Base.metadata.create_all(engine)
        with Session(engine) as db:
            a=User(id='a',nickname='A');b=User(id='b',nickname='B');target=User(id='t',nickname='Kullanıcı adı',avatar_asset='avatar.png',frame_asset='frame.png')
            db.add_all([a,b,target,UserBlock(blocker_id='a',blocked_id='t'),UserBlock(blocker_id='b',blocked_id='t')]);db.commit()
            rows=scope['my_blocks'](db,a)
            self.assertEqual(len(rows),1);self.assertEqual(rows[0]['nickname'],'Kullanıcı adı');self.assertEqual(rows[0]['frame_asset'],'frame.png')
            self.assertEqual(scope['unblock_user']('t',db,a),{'blocked':False})
            self.assertEqual(scope['my_blocks'](db,a),[]);self.assertEqual(len(scope['my_blocks'](db,b)),1)
            self.assertEqual(scope['unblock_user']('t',db,a),{'blocked':False})
            self.assertEqual(len(scope['my_blocks'](db,b)),1)
if __name__=='__main__':unittest.main()
