"""Independent complete-round Monte Carlo for variable ways, top reel, tumbles and wheel."""
from pathlib import Path
import importlib.util,random,statistics,json,sys
spec=importlib.util.spec_from_file_location('kure',Path(__file__).resolve().parents[1]/'backend/app/kure_engine.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def simulate(n,mode,seed):
 rng=random.Random(seed);values=[];bonuses=caps=fs=retriggers=0
 for _ in range(n):
  if mode=='buy':w=m.wheel(purchased=True,rng=rng.random);remaining=w['spins'];mult=w['multiplier'];total=0;cost=100
  else:
   r=m.spin(ante=mode=='ante',rng=rng.random,trace=False);total=r['payoutHundredths'];cost=1.25 if mode=='ante' else 1
   w=m.wheel(rng=rng.random) if r['triggered'] else None;remaining=w['spins'] if w else 0;mult=w['multiplier'] if w else 1;bonuses+=bool(w)
  steps=0
  while remaining and total<m.CAP:
   steps+=1
   if steps>10000:raise RuntimeError('Unexpected free-spin chain')
   remaining-=1;fs+=1;r=m.spin(bonus=True,purchased=mode=='buy',multiplier=mult,remaining_cap=m.CAP-total,rng=rng.random,trace=False);total+=r['payoutHundredths']
   if r['triggered']:
    w=m.wheel(rng=rng.random);remaining+=w['spins'];mult+=w['multiplier'];retriggers+=1
  values.append(total/100/cost);caps+=total>=m.CAP
 mean=statistics.mean(values);half=1.96*statistics.stdev(values)/n**.5
 return {'mode':mode,'samples':n,'seed':seed,'rtp':mean,'ci95':[mean-half,mean+half],'naturalBonusFrequency':bonuses/n if mode!='buy' else None,'freeSpins':fs,'retriggers':retriggers,'caps':caps,'maxWinBetMultiple':max(values)*cost,'roundHitFrequency':sum(v>0 for v in values)/n,'netProfitFrequency':sum(v>1 for v in values)/n,'certified':False}
if __name__=='__main__':
 reports=[]
 for mode,n,seed in [('normal',int(sys.argv[2]) if len(sys.argv)>2 else 200000,745121),('ante',int(sys.argv[2]) if len(sys.argv)>2 else 200000,158742),('buy',int(sys.argv[3]) if len(sys.argv)>3 else 30000,849375)]:
  r=simulate(n,mode,seed);reports.append(r);print(json.dumps(r),flush=True)
 Path(sys.argv[1]).write_text(json.dumps({'targetRtp':.9656,'version':m.CONFIG['version'],'status':m.CONFIG['calibration'],'reports':reports},indent=2)+'\n')
