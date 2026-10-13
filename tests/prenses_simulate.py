"""Complete-round Monte Carlo; production RNG remains server CSPRNG."""
import argparse,importlib.util,json,math,random,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('prenses_math',ROOT/'backend/app/prenses_engine.py');e=importlib.util.module_from_spec(spec);spec.loader.exec_module(e)
def simulate(n,mode,seed):
 rng=random.Random(seed);total=total2=hits=triggers=frees=caps=0;maxwin=0
 for _ in range(n):
  cost=100 if mode=='buy' else 1.25 if mode=='ante' else 1;pool=0
  if mode=='buy':v=0;remaining=15
  else:
   x=e.spin(ante=mode=='ante',rng=rng.random,trace=False);v=x['payoutHundredths'];hits+=bool(v);remaining=15 if x['bonusTriggered'] else 0;triggers+=bool(remaining)
  while remaining and v<500000:
   x=e.spin(bonus=True,pool=pool,remaining_cap=500000-v,rng=rng.random,trace=False);remaining+=x['extraSpins']-1;pool=x['pool'];v+=x['payoutHundredths'];frees+=1
  payout=v/100;ratio=payout/cost;total+=ratio;total2+=ratio*ratio;maxwin=max(maxwin,payout);caps+=v>=500000
 mean=total/n;se=math.sqrt(max(0,(total2-total*total/n)/(n-1))/n)
 return {'mode':mode,'samples':n,'seed':seed,'rtp':mean,'ci95':[max(0,mean-1.96*se),mean+1.96*se],'paid_spin_hit':hits/n if mode!='buy' else None,'bonus_frequency':triggers/n if mode!='buy' else None,'free_spins':frees,'max_observed_x':maxwin,'cap_count':caps,'target_rtp':.965,'note':'Monte Carlo estimate; not certified RTP. Includes full bonuses, retriggers, global pool and cap.'}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--paid',type=int,default=250000);p.add_argument('--buys',type=int,default=30000);p.add_argument('--out',default=str(ROOT/'docs/prenses-statistics.json'));a=p.parse_args();results=[]
 for mode,n,seed in [('base',a.paid,194173),('ante',a.paid,294179),('buy',a.buys,394181)]:
  r=simulate(n,mode,seed);results.append(r);print(json.dumps(r),flush=True)
 Path(a.out).write_text(json.dumps({'version':e.CONFIG['version'],'config':e.CONFIG,'results':results},ensure_ascii=False,indent=2)+'\n')
