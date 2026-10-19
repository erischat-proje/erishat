import json,itertools,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
cfg=json.loads((ROOT/'backend/app/dogparty-math.json').read_text());counts=[cfg['baseReels'][0].count(i) for i in range(11)];probs=[n/sum(counts) for n in counts]
def expected(rate,blocked=()):
 total=0
 for s,p in enumerate(probs):
  if 0 in blocked:continue
  # Middle outcomes: normal match, wild2, wild3, mismatch. Last: match or mismatch.
  options=[]
  for col in (1,2,3):options.append([(False,0,1)] if col in blocked else [(True,0,(1-rate)*p),(True,2,rate*.75),(True,3,rate*.25),(False,0,(1-rate)*(1-p))])
  for combo in itertools.product(*options):
   for last,pl in ((True,p),(False,1-p)) if 4 not in blocked else ((False,1),):
    chance=p*math.prod(x[2] for x in combo)*pl;count=1;mult=0
    for ok,m,_ in combo:
     if not ok:break
     count+=1;mult+=m
    else:count+=bool(last)
    if count>=3:total+=chance*cfg['paytable'][s][count-3]/100*max(1,mult)
 return total*20
wheel={0:1}
for _ in range(9):
 next={}
 for n,p in wheel.items():
  for k,w in enumerate(cfg['wheelWeights'],1):next[n+k]=next.get(n+k,0)+p*w/sum(cfg['wheelWeights'])
 wheel=next
trigger=cfg['bonusTrigger'];base=0
def with_scatters(cols):
 value=0
 for k in range(len(cols)+1):
  for blocked in itertools.combinations(cols,k):value+=(1/3)**k*(2/3)**(len(cols)-k)*expected(cfg['wildRate'],blocked)
 return value
for n,w in enumerate(cfg['scatterCounts']):
 for cols in itertools.combinations([0,2,4],n):base+=(1-trigger)*w/sum(cfg['scatterCounts'])/math.comb(3,n)*with_scatters(cols)
base+=trigger*(5+with_scatters([0,2,4]))
def future(q):return sum(p*sum(expected(1-(1-q)**t) for t in range(1,n+1)) for n,p in wheel.items())
q=cfg['bonusWildRate']
r={'baseExpected':base,'futureBonusUncapped':future(q),'bonusWildRate':q,'uncappedRtp':base+trigger*future(q),'note':'Exact marginal line expectation summed over 20; independent stops/sticky masks; scattered reel selections weighted with 1/3 row hit probability; weighted 9-cell wheel. Round cap excluded.'}
print(json.dumps(r,indent=2))
