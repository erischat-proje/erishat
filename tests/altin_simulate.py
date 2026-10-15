"""Independent complete-round Monte Carlo including copies, 4 boards, extras and cap."""
from pathlib import Path
import importlib.util,random,statistics,json,sys
spec=importlib.util.spec_from_file_location('altin',Path(__file__).resolve().parents[1]/'backend/app/altin_engine.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def simulate(n,mode,seed):
 rng=random.Random(seed);values=[];bonuses=spins=copies=caps=0;jackpots=[0]*4
 for _ in range(n):
  if mode=='buy':bonus=m.start_bonus(rng=rng.random,purchased=True);total=0;cost=100
  else:
   r=m.spin(rng=rng.random,trace=False);bonus=r['bonus'];total=r['payoutHundredths'];cost=1;copies+=bool(r['copyColumns']);bonuses+=bool(bonus)
  count=0
  while bonus and bonus['remaining'] and total<m.CAP:
   count+=1
   if count>10000:raise RuntimeError('Unexpected extra-spin chain')
   r=m.respin(bonus,rng=rng.random,remaining_cap=m.CAP-total);bonus=r['bonus'];total+=r['payoutHundredths'];spins+=1
   for g in r['newJackpots']:jackpots[g]+=1
  values.append(total/100/cost);caps+=total>=m.CAP
 mean=statistics.mean(values);half=1.96*statistics.stdev(values)/n**.5
 return {'mode':mode,'samples':n,'seed':seed,'rtp':mean,'ci95':[mean-half,mean+half],'naturalBonusFrequency':bonuses/n if mode=='normal' else None,'copyFrequency':copies/n if mode=='normal' else None,'respins':spins,'jackpots':jackpots,'capHits':caps,'maxWinMultiple':max(values)*cost,'roundHitFrequency':sum(v>0 for v in values)/n,'netProfitFrequency':sum(v>1 for v in values)/n,'certified':False}
if __name__=='__main__':
 reports=[]
 for mode,n,seed in [('normal',int(sys.argv[2]) if len(sys.argv)>2 else 200000,147651),('buy',int(sys.argv[3]) if len(sys.argv)>3 else 50000,712398)]:
  r=simulate(n,mode,seed);reports.append(r);print(json.dumps(r),flush=True)
 Path(sys.argv[1]).write_text(json.dumps({'targetRtp':.965,'version':m.CONFIG['version'],'status':m.CONFIG['calibration'],'reports':reports},indent=2)+'\n')
