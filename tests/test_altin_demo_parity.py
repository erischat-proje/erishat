"""The one-file demo and server must return identical boards from identical RNG streams."""
import importlib.util,json,random,subprocess,shutil
from pathlib import Path
import pytest
ROOT=Path(__file__).resolve().parents[1]
@pytest.mark.parametrize('seed',[17291,81117,441202,812983])
def test_demo_server_parity(seed):
 if not shutil.which('node'):pytest.skip('Node required for offline demo parity')
 spec=importlib.util.spec_from_file_location('altin_parity',ROOT/'backend/app/altin_engine.py');e=importlib.util.module_from_spec(spec);spec.loader.exec_module(e)
 generator=random.Random(seed);values=[generator.random() for _ in range(20000)]
 it=iter(values);rng=lambda:next(it)
 expected=[e.spin(rng=rng)]
 for purchased in [False,True]:
  bonus=e.start_bonus(rng=rng,purchased=purchased);expected.append(bonus)
  for _ in range(4):
   result=e.respin(bonus,rng=rng);expected.append(result);bonus=result['bonus']
 code="""const fs=require('fs'),vm=require('vm');global.window=global;const v=JSON.parse(fs.readFileSync(0,'utf8'));vm.runInThisContext(fs.readFileSync(v.source,'utf8'));const e=AltinMath.create(v.config);let i=0;const rng=()=>v.values[i++],out=[e.spin({rng})];for(const purchased of [false,true]){let bonus=e.startBonus(null,rng,purchased);out.push(bonus);for(let j=0;j<4;j++){const r=e.respin(bonus,{rng});out.push(r);bonus=r.bonus;}}process.stdout.write(JSON.stringify(out));"""
 payload={'source':str(ROOT/'frontend/games/altin-math.js'),'config':e.CONFIG,'values':values}
 result=subprocess.run(['node','-e',code],input=json.dumps(payload),text=True,capture_output=True,check=True)
 assert json.loads(result.stdout)==expected
