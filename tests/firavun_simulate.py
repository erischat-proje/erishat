"""Full rounds with three payout phases, retriggers, type-specific reels and cap."""
import importlib.util,random,statistics,json,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('firavun',Path(__file__).resolve().parents[1]/'backend/app/firavun_engine.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def simulate(n,mode,seed):
 rng=random.Random(seed);values=[];hits=bonuses=frees=caps=expansions=retriggers=0;maxwin=0
 for _ in range(n):
  if mode=='buy':total=0;remaining=10;cost=100
  else:
   result=m.spin(rng=rng.random,trace=False);total=result['payoutHundredths'];remaining=result['bonusSpins'];hits+=total>0;bonuses+=bool(remaining);cost=1
  special=m.choose_special(rng.random) if remaining else None
  while remaining and total<m.CAP:
   result=m.spin(bonus=True,purchased=mode=='buy',special=special,remaining_cap=m.CAP-total,rng=rng.random,trace=False);total+=result['payoutHundredths'];remaining+=result['extraSpins']-1;frees+=1;expansions+=bool(result['expandColumns']);retriggers+=bool(result['extraSpins'])
  payout=total/100;values.append(payout/cost);maxwin=max(maxwin,payout);caps+=total>=m.CAP
 mean=statistics.mean(values);half=1.96*statistics.stdev(values)/n**.5
 return {'mode':mode,'samples':n,'seed':seed,'rtp':mean,'ci95':[mean-half,mean+half],'paidHitFrequency':hits/n if mode=='normal' else None,'bonusFrequency':bonuses/n if mode=='normal' else None,'freeSpins':frees,'expandingSpins':expansions,'retriggers':retriggers,'caps':caps,'maxWinBetMultiple':maxwin,'roundHitFrequency':sum(v>0 for v in values)/n,'netProfitFrequency':sum(v>1 for v in values)/n,'certified':False}
if __name__=='__main__':
 results=[]
 for mode,n,seed in [('normal',500000,1539863),('buy',50000,1639867)]:
  r=simulate(n,mode,seed);results.append(r);print(json.dumps(r),flush=True)
 Path(sys.argv[1] if len(sys.argv)>1 else 'firavun-statistics.json').write_text(json.dumps({'targetRtp':.965,'version':m.CONFIG['version'],'config':{k:v for k,v in m.CONFIG.items() if k not in ['baseReels','bonusReels','buyBonusReels']},'reports':results},indent=2)+'\n')
