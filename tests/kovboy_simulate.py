"""Complete-round independent Monte Carlo including floor, overlays and cap."""
from pathlib import Path
import importlib.util,random,statistics,json,sys
spec=importlib.util.spec_from_file_location('kovboy',Path(__file__).resolve().parents[1]/'backend/app/kovboy_engine.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def simulate(n,mode,seed):
 rng=random.Random(seed);values=[];hits=bonuses=caps=frees=floors=0;maximum=0
 for _ in range(n):
  if mode=='buy':remaining=8;total=0;cost=100
  else:
   result=m.spin(rng=rng.random,trace=False);total=result['payoutHundredths'];remaining=result['bonusSpins'];hits+=bool(total);bonuses+=bool(remaining);cost=1
  sticky={};bonus_total=0
  while remaining and total<m.CAP:
   result=m.spin(purchased=mode=='buy',bonus=True,sticky=sticky,remaining_cap=m.CAP-total,rng=rng.random,trace=False);total+=result['payoutHundredths'];bonus_total+=result['payoutHundredths'];sticky=result['sticky'];remaining+=result['extraSpins']-1;frees+=1
   if not remaining and total<m.CAP and bonus_total<1000:
    total+=min(m.CAP-total,1000-bonus_total);floors+=1
  payout=total/100;values.append(payout/cost);maximum=max(maximum,payout);caps+=total>=m.CAP
 mean=statistics.mean(values);half=1.96*statistics.stdev(values)/n**.5
 return {'mode':mode,'samples':n,'seed':seed,'rtp':mean,'ci95':[mean-half,mean+half],'paidHitFrequency':hits/n if mode=='normal' else None,'bonusFrequency':bonuses/n if mode=='normal' else None,'freeSpins':frees,'floorSupplements':floors,'caps':caps,'maxWinBetMultiple':maximum,'roundHitFrequency':sum(v>0 for v in values)/n,'netProfitFrequency':sum(v>1 for v in values)/n,'certified':False}
if __name__=='__main__':
 reports=[]
 for mode,n,seed in [('normal',500000,929887),('buy',50000,1029889)]:
  r=simulate(n,mode,seed);reports.append(r);print(json.dumps(r),flush=True)
 Path(sys.argv[1] if len(sys.argv)>1 else 'kovboy-statistics.json').write_text(json.dumps({'targetRtp':.9651,'version':m.CONFIG['version'],'config':{k:v for k,v in m.CONFIG.items() if k not in ['baseReels','bonusReels']},'reports':reports},indent=2)+'\n')
