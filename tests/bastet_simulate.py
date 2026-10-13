"""Independent full-round Monte Carlo, includes every free respin and sticky cell."""
from pathlib import Path
import importlib.util,random,statistics,json,sys
spec=importlib.util.spec_from_file_location('bastet',Path(__file__).resolve().parents[1]/'backend/app/bastet_engine.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def simulate(n,mode,seed):
 rng=random.Random(seed);values=[];bonuses=frees=respins=caps=0
 for _ in range(n):
  sticky={};locks={};respin=False;mode_bonus=False;remaining=0;total=0
  if mode=='buy':remaining=8;cost=100
  else:
   cost=1;r=m.spin(rng=rng.random,trace=False);total=r['payoutHundredths'];remaining=r['bonusSpins'];bonuses+=bool(remaining);respin=r['respin'];locks=r['locked']
  steps=0
  while remaining or respin:
   if total>=m.CAP:break
   steps+=1
   if steps>10000:raise RuntimeError('Unexpected respin chain; no forced payout or silent truncation')
   bonus=mode_bonus if respin else True
   if not respin:remaining-=1
   r=m.spin(bonus=bonus,sticky=sticky,locked=locks,respin=respin,remaining_cap=m.CAP-total,rng=rng.random,trace=False)
   frees+=bonus;respins+=respin;total+=r['payoutHundredths'];remaining+=r['extraSpins'];sticky=r['sticky'];locks=r['locked'];respin=r['respin'];mode_bonus=r['respinBonus']
  values.append(total/100/cost);caps+=total>=m.CAP
 mean=statistics.mean(values);half=1.96*statistics.stdev(values)/n**.5
 return {'mode':mode,'samples':n,'seed':seed,'rtp':mean,'ci95':[mean-half,mean+half],'bonusFrequency':bonuses/n if mode=='normal' else None,'freeSpins':frees,'respins':respins,'caps':caps,'maxWin':max(values)*(100 if mode=='buy' else 1),'certified':False}
if __name__=='__main__':
 reports=[]
 for mode,n,seed in [('normal',int(sys.argv[2]) if len(sys.argv)>2 else 50000,731994),('buy',int(sys.argv[3]) if len(sys.argv)>3 else 10000,139994)]:
  r=simulate(n,mode,seed);reports.append(r);print(json.dumps(r),flush=True)
 Path(sys.argv[1]).write_text(json.dumps({'targetRtp':.962,'version':1,'status':'simulation-estimate-not-certified','reports':reports},indent=2)+'\n')
