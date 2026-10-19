"""Independent complete-round audit for natural profiles; no wallet or network."""
from pathlib import Path
import sys,importlib,random,json,math,statistics,argparse,copy,hashlib
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from backend.app import natural_bonus as n
GAMES=list(n.PROFILES)

def run(game,samples,seed,mode='normal',condition=None):
 e=n._engine(game);rng=random.Random(seed);ante=mode=='ante';cfg=copy.deepcopy(n.entry_config(game));bcfg=n.bonus_config(game,{'natural_profile':n.PROFILE,'ante':ante})
 p=n.PROFILES[game].get('ante_probability') if ante else n.PROFILES[game]['probability']
 if condition is not None:
  if game in ('dede','prenses','dogparty','kovboy','bastet','firavun'):cfg['bonusTrigger']=int(condition)/(2 if ante and game in ('dede','prenses') else 1)
  elif game=='candy':cfg['anteBonusTrigger' if ante else 'bonusTrigger']=int(condition)
  elif game in ('seker','balikci'):
   key='anteScatters' if ante else 'scatters';threshold=4 if game=='seker' else 3;cfg[key]=[w if (i>=threshold)==condition else 0 for i,w in enumerate(cfg[key])]
  elif game=='kure':
   weights=cfg['baseScatterCountWeights'];rate=cfg['scatterRate']*(2 if ante else 1)
   cfg['scatterRate']=(1 if condition else rate*(sum(weights[:2])/sum(weights))/(1-p))/(2 if ante else 1)
   cfg['baseScatterCountWeights']=[w if (i>=2)==condition else 0 for i,w in enumerate(weights)]
  else:raise ValueError('Unsupported conditioning')
 values=[];basevals=[];bonuses=frees=caps=0;triggerbase=[]
 for _ in range(samples):
  kw={'rng':rng.random,'trace':False,'config':cfg}
  if game in ('dede','prenses','seker','candy','kure'):kw['ante']=ante
  r=e.spin(game,**kw) if game in ('aztek','ares') else e.spin(**kw)
  paid=r['payoutHundredths'];total=paid;pool=0;sticky={};spots=[0]*49;collected=0;multiplier=1;special=None;bonus_total=0;locks=r.get('locked',{});respin=r.get('respin',False);respin_bonus=False
  if game in ('dede','prenses'):remaining=15 if r['bonusTriggered'] else 0
  elif game=='seker':remaining=10 if r['bonusTriggered'] else 0
  elif game=='kure':
   wheel=e.wheel(rng=rng.random) if r['triggered'] else None;remaining=wheel['spins'] if wheel else 0;multiplier=wheel['multiplier'] if wheel else 1
  else:remaining=r.get('bonusSpins',r.get('awarded',0))
  if game=='firavun' and remaining:special=e.choose_special(rng.random)
  hit=bool(remaining) or r.get('goldFever',False);bonuses+=hit
  if hit:triggerbase.append(paid/100)
  steps=0
  while (remaining or respin) and total<getattr(e,'CAP',500000):
   steps+=1
   if steps>10000:raise RuntimeError('Unexpected bonus continuation')
   bonus=respin_bonus if respin else True
   if not respin:remaining-=1
   kw={'bonus':bonus,'remaining_cap':getattr(e,'CAP',500000)-total,'rng':rng.random,'trace':False,'config':bcfg if bonus else cfg}
   if game in ('dede','prenses'):kw['pool']=pool
   if game in ('dogparty','kovboy','bastet'):kw['sticky']=sticky
   if game=='balikci':kw['collected']=collected
   if game=='candy':kw['spots']=spots
   if game=='kure':kw['multiplier']=multiplier
   if game=='firavun':kw['special']=special
   if game=='bastet':kw.update(locked=locks,respin=respin)
   r=e.spin(game,**kw) if game in ('aztek','ares') else e.spin(**kw)
   total+=r['payoutHundredths'];bonus_total+=r['payoutHundredths'];remaining+=r.get('extraSpins',r.get('awarded',0));frees+=1
   pool=r.get('pool',pool);sticky=r.get('sticky',sticky);spots=r.get('spots',spots);collected=r.get('collected',collected);locks=r.get('locked',locks);respin=r.get('respin',False);respin_bonus=r.get('respinBonus',False)
   if game=='kovboy' and not remaining:
    floor=n.bonus_floor(game,{'natural_profile':n.PROFILE},1000);topup=min(e.CAP-total,max(0,floor-bonus_total));total+=topup;bonus_total+=topup
  cost=1.25 if ante else 1;values.append(total/100/cost);basevals.append(paid/100/cost);caps+=total>=getattr(e,'CAP',500000)
 mean=statistics.mean(values);se=statistics.stdev(values)/samples**.5
 sources=list((ROOT/'backend/app').glob('*_engine.py'))+[ROOT/'backend/app/natural_bonus.py',ROOT/'backend/app/natural-bonus-v1.json',ROOT/'backend/app/aztek_ares_v2.py',Path(__file__)]
 return dict(game=game,mode=mode,condition=condition,samples=samples,seed=seed,profile=n.PROFILE,parameters=copy.deepcopy(n.PROFILES[game]),probability=p,rtp=mean,ci95=[mean-1.96*se,mean+1.96*se],base_rtp=statistics.mean(basevals),trigger_paid_mean=statistics.mean(triggerbase) if triggerbase else None,bonus_frequency=bonuses/samples,free_spins=frees,caps=caps,max_observed=max(values),certified=False,source_sha256={str(f.relative_to(ROOT)):hashlib.sha256(f.read_bytes()).hexdigest() for f in sources})

if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('game',choices=GAMES);a.add_argument('--samples',type=int,default=100000);a.add_argument('--seed',type=int,default=26101591);a.add_argument('--ante',action='store_true');a.add_argument('--condition',choices=['yes','no']);a.add_argument('--out',type=Path);args=a.parse_args()
 report=run(args.game,args.samples,args.seed,'ante' if args.ante else 'normal',None if args.condition is None else args.condition=='yes')
 if args.out:args.out.write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps({k:v for k,v in report.items() if k!='source_sha256'}),flush=True)
