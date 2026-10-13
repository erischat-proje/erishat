"""Reproduce calibration using published pre-selection strips; does not mutate production config."""
from pathlib import Path
import importlib.util,random,statistics,json,math
root=Path(__file__).resolve().parents[1]/'backend/app';sp=importlib.util.spec_from_file_location('fish',root/'balikci_engine.py');e=importlib.util.module_from_spec(sp);sp.loader.exec_module(e)
c={**e.CONFIG};c['baseReels']=[]
for col in range(5):
 vals=[symbol for symbol,count in enumerate([360,178,138,99,69,39,29,19,9,60]) for _ in range(count)];random.Random(310733+col).shuffle(vals);c['baseReels'].append(vals)
r=random.Random(873811);values=[];n=60000;cfg={**c,'scatters':[0,0,0,9000,900,100]};spins=0;cap=0
for _ in range(n):
 x=e.spin(config=cfg,rng=r.random,trace=False);base=x['payoutHundredths'];v=base;rem=x['bonusSpins'];collected=0
 while rem and v<e.CAP:
  x=e.spin(bonus=True,collected=collected,remaining_cap=e.CAP-v,rng=r.random,trace=False);v+=x['payoutHundredths'];rem+=x['extraSpins']-1;collected=x['collected'];spins+=1
 values.append((v-base)/100);cap+=v>=e.CAP
mean=statistics.mean(values);se=statistics.stdev(values)/n**.5

def analytical(counts):
 probs=[n/sum(counts) for n in counts];result=0
 for scat,w in enumerate(c['scatters']):
  f=[]
  for k in [3,4,5]:f.append(sum(math.comb(k,m)*math.comb(5-k,scat-m)/math.comb(5,scat)*(2/3)**m for m in range(k+1) if 0<=scat-m<=5-k))
  result+=sum(p**3*f[0]*pay[0]+p**4*f[1]*(pay[1]-pay[0])+p**5*f[2]*(pay[2]-pay[1]) for p,pay in zip(probs,c['paytable']))*w/sum(c['scatters'])*10/100
 return result
candidates=[]
for ten in range(350,381):
 counts=[ten,538-ten,138,99,69,39,29,19,9,60];base=analytical(counts);rtp=base+mean/113;candidates.append((abs(rtp-.9671),ten,base,rtp))
best=min(candidates);out={'samples':n,'seed':873811,'futureBonusMean':mean,'futureBonusMeanCi95':[mean-1.96*se,mean+1.96*se],'freeSpins':spins,'cappedFeatures':cap,'selectedTenCount':best[1],'analyticBaseRtp':best[2],'estimatedCombinedRtp':best[3],'combinedCi95':[best[3]-1.96*se/113,best[3]+1.96*se/113]};(Path(__file__).resolve().parents[1]/'docs/hasan-v3-conditional.json').write_text(json.dumps(out,indent=2));print(json.dumps(out),flush=True)
