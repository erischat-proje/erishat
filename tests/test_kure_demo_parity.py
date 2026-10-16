"""Identical RNG streams must produce identical server/demo tumble and wheel results."""
import importlib.util,json,random,subprocess,shutil
from pathlib import Path
import pytest
ROOT=Path(__file__).resolve().parents[1]
@pytest.mark.parametrize('seed',[551208,749901,384415,259107])
def test_demo_server_parity(seed):
 if not shutil.which('node'):pytest.skip('Node needed for offline demo parity')
 spec=importlib.util.spec_from_file_location('kure_parity',ROOT/'backend/app/kure_engine.py');e=importlib.util.module_from_spec(spec);spec.loader.exec_module(e)
 generator=random.Random(seed);values=[generator.random() for _ in range(40000)];it=iter(values);rng=lambda:next(it)
 expected=[]
 for mode in ['normal','ante','bonus']:
  expected.append(e.spin(rng=rng,ante=mode=='ante',bonus=mode=='bonus',multiplier=25 if mode=='bonus' else 1))
 expected.append(e.wheel(rng=rng));expected.append(e.wheel(rng=rng,purchased=True))
 code="""const fs=require('fs'),vm=require('vm');global.window=global;const v=JSON.parse(fs.readFileSync(0,'utf8'));vm.runInThisContext(fs.readFileSync(v.source,'utf8'));const e=KureMath.create(v.config);let i=0;const rng=()=>v.values[i++],out=[];for(const mode of ['normal','ante','bonus'])out.push(e.spin({rng,ante:mode==='ante',bonus:mode==='bonus',multiplier:mode==='bonus'?25:1}));out.push(e.wheel({rng}),e.wheel({rng,purchased:true}));process.stdout.write(JSON.stringify(out));"""
 payload={'source':str(ROOT/'frontend/games/kure-math.js'),'config':e.CONFIG,'values':values};result=subprocess.run(['node','-e',code],input=json.dumps(payload),text=True,capture_output=True,check=True)
 assert json.loads(result.stdout)==expected
