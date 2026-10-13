"""Independent Monte Carlo report. Whole bonus cost is in RTP denominator."""
import importlib.util,random,statistics,json,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('candy',Path(__file__).resolve().parents[1]/'backend/app/candy_engine.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def run(mode,n,seed):
 rng=random.Random(seed);values=[];hits=0;caps=0;bonuses=0;frees=0;maxwin=0
 for _ in range(n):
  if mode=='buy':remaining=m.buy_spins(rng.random);total=0;spots=[0]*49;cost=100
  else:
   r=m.spin(ante=mode=='ante',rng=rng.random,trace=False);total=r['payoutHundredths'];remaining=r['bonusSpins'];spots=[0]*49;cost=1.25 if mode=='ante' else 1;hits+=total>0;bonuses+=remaining>0
  while remaining and total<500000:
   remaining-=1;frees+=1;r=m.spin(bonus=True,spots=spots,remaining_cap=500000-total,rng=rng.random,trace=False);total+=r['payoutHundredths'];spots=r['spots']
  payout=total/100;values.append(payout/cost);caps+=total>=500000;maxwin=max(maxwin,payout)
 mean=statistics.mean(values);ci=1.96*statistics.stdev(values)/n**.5
 return {'mode':mode,'samples':n,'seed':seed,'rtp':mean,'ci95':[mean-ci,mean+ci],'paidHitFrequency':hits/n if mode!='buy' else None,'bonusFrequency':bonuses/n if mode!='buy' else None,'freeSpins':frees,'caps':caps,'maxWinBetMultiple':maxwin,'certified':False}
if __name__=='__main__':
 report={'targetRtp':.965,'profile':m.CONFIG,'reports':[]}
 for mode,n,seed in [('normal',100000,319857),('ante',100000,419859),('buy',30000,519863)]:
  result=run(mode,n,seed);report['reports'].append(result);print(json.dumps(result),flush=True)
 Path(sys.argv[1] if len(sys.argv)>1 else 'candy-statistics.json').write_text(json.dumps(report,indent=2)+'\n')
