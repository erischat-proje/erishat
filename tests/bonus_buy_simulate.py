"""Independent purchase-mode Monte Carlo; natural math is left unchanged."""
import argparse,importlib.util,json,random,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def run(game,n,seed):
 sp=importlib.util.spec_from_file_location(game,ROOT/'backend/app'/f'{game}_engine.py');e=importlib.util.module_from_spec(sp);sp.loader.exec_module(e);buy=json.loads((ROOT/'backend/app/slot-bonus-buy.json').read_text())[game];rng=random.Random(seed);total=total2=caps=frees=0;mx=0;awards={}
 for _ in range(n):
  remaining=buy['spins'] if game=='balikci' else sum(1+e.weighted(rng.random,buy['wheelWeights']) for _ in range(9));awards[remaining]=awards.get(remaining,0)+1;v=0;sticky={};collected=0
  while remaining and v<e.CAP:
   if game=='balikci':
    r=e.spin(bonus=True,collected=collected,remaining_cap=e.CAP-v,config={**e.CONFIG,'wildCounts':buy['wildCounts']},rng=rng.random,trace=False);collected=r['collected'];remaining+=r['extraSpins']
   else:r=e.spin(bonus=True,sticky=sticky,remaining_cap=e.CAP-v,rng=rng.random,trace=False);sticky=r['sticky']
   v+=r['payoutHundredths'];remaining-=1;frees+=1
  ratio=v/100/buy['price'];total+=ratio;total2+=ratio*ratio;caps+=v>=e.CAP;mx=max(mx,v/100)
 mean=total/n;se=math.sqrt((total2-total*total/n)/(n-1)/n)
 return {'game':game,'profile':buy['profile'],'price':buy['price'],'samples':n,'seed':seed,'rtp':mean,'ci95':[mean-1.96*se,mean+1.96*se],'freeSpins':frees,'initialSpinsDistribution':awards,'capCount':caps,'maxObservedX':mx,'note':'Independent purchase-mode simulation; target is not certified RTP.'}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('game',choices=['balikci','dogparty']);p.add_argument('--samples',type=int,default=100000);p.add_argument('--seed',type=int,default=304847);p.add_argument('--out',required=True);a=p.parse_args();r=run(a.game,a.samples,a.seed);Path(a.out).write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
