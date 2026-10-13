"""Offline statistical validation; never operates a user wallet."""
import argparse,importlib.util,json,math,random,statistics,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('seker_math',ROOT/'backend/app/seker_engine.py');e=importlib.util.module_from_spec(spec);spec.loader.exec_module(e)
def simulate(n,mode,seed):
    rng=random.Random(seed);sum1=0;sum2=0;hits=0;bonus_count=0;maxwin=0;spins=0
    for i in range(n):
        cost=100 if mode=='buy' else 1.25 if mode=='ante' else 1
        if mode=='buy':v=0;remaining=10
        else:
            x=e.spin(ante=mode=='ante',rng=rng.random,trace=False);v=x['payoutHundredths'];hits+=bool(v);remaining=10 if x['bonusTriggered'] else 0;bonus_count+=bool(remaining)
        while remaining and v<e.CAP:
            x=e.spin(bonus=True,rng=rng.random,remaining_cap=e.CAP-v,trace=False);remaining+=x['extraSpins']-1;v+=x['payoutHundredths'];spins+=1
        payout=v/100;ratio=payout/cost;sum1+=ratio;sum2+=ratio*ratio;maxwin=max(maxwin,payout)
    mean=sum1/n;se=math.sqrt(max(0,(sum2-sum1*sum1/n)/(n-1)))/math.sqrt(n)
    return {'mode':mode,'samples':n,'seed':seed,'rtp':mean,'ci95':[max(0,mean-1.96*se),mean+1.96*se],'paid_spin_hit':hits/n if mode!='buy' else None,'bonus_frequency':bonus_count/n if mode!='buy' else None,'free_spins_simulated':spins,'max_observed_x':maxwin,'target_rtp':e.CONFIG['targetRtp'],'note':'Monte Carlo estimate, not certified RTP. Cap and retriggers are included.'}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--paid',type=int,default=250000);p.add_argument('--buys',type=int,default=40000);p.add_argument('--out',default=str(ROOT/'docs/seker-statistics.json'));a=p.parse_args();results=[]
    for mode,n,seed in [('base',a.paid,613071),('ante',a.paid,813077),('buy',a.buys,913081)]:
        r=simulate(n,mode,seed);results.append(r);print(json.dumps(r),flush=True)
    Path(a.out).write_text(json.dumps({'version':e.CONFIG['version'],'config':e.CONFIG,'results':results},ensure_ascii=False,indent=2))
