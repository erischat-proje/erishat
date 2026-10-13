"""Offline reproducible full-round Monte Carlo; no wallet access."""
from pathlib import Path
import importlib.util,argparse,random,json,math
ROOT=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('fish',ROOT/'backend/app/balikci_engine.py');e=importlib.util.module_from_spec(s);s.loader.exec_module(e)
def simulate(n,seed):
 rng=random.Random(seed);total=0;squared=0;hit=0;triggers=0;frees=0;maxwin=0;stages=[0]*4;capped=0;base=0;bonus=0;bonus_line=0;bonus_fish=0;bonus_dynamite=0
 for _ in range(n):
  x=e.spin(rng=rng.random,trace=False);value=x['payoutHundredths'];base+=value;hit+=bool(value);remaining=x['bonusSpins'];triggers+=bool(remaining);collected=0
  while remaining and value<e.CAP:
   x=e.spin(bonus=True,collected=collected,remaining_cap=e.CAP-value,rng=rng.random,trace=False);value+=x['payoutHundredths'];bonus+=x['payoutHundredths'];bonus_line+=x['lineHundredths'];bonus_dynamite+=x['collectionHundredths'] if x['dynamite'] else 0;bonus_fish+=x['collectionHundredths'] if not x['dynamite'] else 0;remaining+=x['extraSpins']-1;collected=x['collected'];frees+=1
  if collected:stages[min(3,collected//4)]+=1
  capped+=value>=e.CAP;v=value/100;total+=v;squared+=v*v;maxwin=max(maxwin,v)
 mean=total/n;se=math.sqrt(max(0,(squared-total*total/n)/(n-1)))/math.sqrt(n)
 return {'version':e.CONFIG['version'],'samples':n,'seed':seed,'targetRtp':e.CONFIG['targetRtp'],'rtp':mean,'ci95':[max(0,mean-1.96*se),mean+1.96*se],'baseRtp':base/n/100,'bonusLineRawRtp':bonus_line/n/100,'bonusFishRawRtp':bonus_fish/n/100,'bonusDynamiteRawRtp':bonus_dynamite/n/100,'bonusRtp':bonus/n/100,'paidHit':hit/n,'bonusFrequency':triggers/n,'bonusFrequencyTarget':1/113,'bonusTriggers':triggers,'freeSpins':frees,'stagesReached':[0]+stages[1:],'cappedRounds':capped,'maxObservedX':maxwin,'config':e.CONFIG,'note':'Monte Carlo estimate; target RTP is not certified. Entire triggered bonus chains and cap are included.'}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--n',type=int,default=500000);p.add_argument('--seed',type=int,default=138613);p.add_argument('--out',default=str(ROOT/'docs/balikci-statistics.json'));a=p.parse_args();r=simulate(a.n,a.seed);Path(a.out).write_text(json.dumps(r,ensure_ascii=False,indent=2));print(json.dumps({k:v for k,v in r.items() if k!="config"}),flush=True)
