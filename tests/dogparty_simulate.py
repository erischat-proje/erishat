import argparse,importlib.util,random,json,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];spec=importlib.util.spec_from_file_location('dogmath',ROOT/'backend/app/dogparty_engine.py');e=importlib.util.module_from_spec(spec);spec.loader.exec_module(e)
def simulate(n,seed,config=e.CONFIG):
 rng=random.Random(seed);total=squares=hits=bonus=frees=caps=0;maximum=0
 for _ in range(n):
  x=e.spin(rng=rng.random,trace=False,config=config);v=x['payoutHundredths'];hits+=bool(v);remaining=x['bonusSpins'];bonus+=bool(remaining);sticky={}
  while remaining and v<e.CAP:
   x=e.spin(bonus=True,sticky=sticky,remaining_cap=e.CAP-v,rng=rng.random,trace=False,config=config);sticky=x['sticky'];v+=x['payoutHundredths'];remaining-=1;frees+=1
  p=v/100;total+=p;squares+=p*p;maximum=max(maximum,p);caps+=v>=e.CAP
 mean=total/n;se=math.sqrt(max(0,(squares-total*total/n)/(n-1))/n)
 return {'samples':n,'seed':seed,'rtp':mean,'ci95':[max(0,mean-1.96*se),mean+1.96*se],'paidHit':hits/n,'bonusFrequency':bonus/n,'freeSpins':frees,'maxObserved':maximum,'capCount':caps,'targetRtp':.9651,'status':'Monte Carlo estimate, not certified RTP; complete bonuses and cap included.'}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--spins',type=int,default=1000000);p.add_argument('--seed',type=int,default=194831);p.add_argument('--out',default=str(ROOT/'docs/dogparty-statistics.json'));a=p.parse_args();r=simulate(a.spins,a.seed);Path(a.out).write_text(json.dumps({'version':e.CONFIG['version'],'results':r,'config':e.CONFIG},indent=2)+'\n');print(json.dumps(r))
