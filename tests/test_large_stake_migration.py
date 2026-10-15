"""Run the production widening loop twice against a schema-state connection."""
import ast
from pathlib import Path
from types import SimpleNamespace
from sqlalchemy import text

def test_existing_integer_wagers_widen_once_without_touching_other_types():
    source=Path(__file__).resolve().parents[1]/'backend/app/main.py'
    tree=ast.parse(source.read_text())
    function=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='ensure_system_data_columns')
    loop=next(n for n in function.body[0].body if isinstance(n,ast.For) and isinstance(n.target,ast.Tuple))
    schema={('game_bets','amount'):'bigint',('game_bets','payout'):'integer',
            ('classic_slot_accounts','stake'):'integer',('classic_slot_receipts','amount'):'integer'}
    statements=[]
    class Connection:
        def execute(self,sql,params=None):
            statement=str(sql)
            if params:return SimpleNamespace(scalar=lambda:schema.get((params['table'],params['column'])))
            parts=statement.split();assert parts[:2]==['ALTER','TABLE'] and parts[-2:]==['TYPE','BIGINT']
            key=parts[2],parts[5];schema[key]='bigint';statements.append(key)
    code=compile(ast.fix_missing_locations(ast.Module(body=[loop],type_ignores=[])),'production_migration','exec')
    ns={'conn':Connection(),'text':text};exec(code,ns)
    assert statements==[('game_bets','payout'),('classic_slot_accounts','stake'),('classic_slot_receipts','amount')]
    exec(code,ns)
    assert len(statements)==3 and set(schema.values())=={'bigint'}
