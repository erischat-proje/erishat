"""Original Dog Party: 20 fixed lines, additive wilds and bonus sticky state."""
import json,secrets
from pathlib import Path
CONFIG=json.loads(Path(__file__).with_name('dogparty-math.json').read_text())
KEYS=['ten','jack','queen','king','ace','bone','collar','dachshund','pug','shihtzu','rottweiler','scatter','wild']
LINES=[[1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],[0,1,2,1,0],[2,1,0,1,2],[0,0,1,2,2],[2,2,1,0,0],[1,0,0,0,1],[1,2,2,2,1],[0,1,1,1,0],[2,1,1,1,2],[1,0,1,2,1],[1,2,1,0,1],[0,1,0,1,0],[2,1,2,1,2],[1,1,0,1,1],[1,1,2,1,1],[0,2,0,2,0],[2,0,2,0,2],[0,2,2,2,0]]
PAY=CONFIG['paytable'];CAP=675000

def weighted(rng,weights):
 p=rng()*sum(weights)
 for i,w in enumerate(weights):
  p-=w
  if p<0:return i
 return len(weights)-1

def evaluate(board,paytable=PAY):
 wins=[]
 for number,line in enumerate(LINES,1):
  indices=[line[col]*5+col for col in range(5)];symbol=board[indices[0]]['s']
  if symbol>=11:continue
  count=0;mult=0
  for index in indices:
   cell=board[index]
   if cell['s'] not in (symbol,12):break
   count+=1
   if cell['s']==12:mult+=cell['m']
  if count>=3:
   base=paytable[symbol][count-3];wins.append({'line':number,'symbol':KEYS[symbol],'count':count,'indices':indices[:count],'baseHundredths':base,'multiplier':max(1,mult),'payHundredths':base*max(1,mult)})
 return sum(w['payHundredths'] for w in wins),wins

def spin(*,bonus=False,sticky=None,remaining_cap=CAP,rng=None,config=CONFIG,forced_board=None,model_version=None,trace=True):
 if model_version not in (None,config['version']):raise ValueError('Unsupported stored Dog Party model')
 rng=rng or secrets.SystemRandom().random;sticky=sticky or {};saved={int(k):int(v) for k,v in sticky.items()}
 if any(i<0 or i>=15 or i%5 not in (1,2,3) or m not in (2,3) for i,m in saved.items()):raise ValueError('Invalid sticky cells')
 if not bonus:saved={}
 if forced_board is None:
  strips=config['bonusReels'] if bonus else config['baseReels'];stops=[int(rng()*len(strip)) for strip in strips]
  board=[{'s':strips[col][(stops[col]+row)%len(strips[col])]} for row in range(3) for col in range(5)]
  rate=config['bonusWildRate'] if bonus else config['wildRate']
  for index in range(15):
   if index%5 in (1,2,3) and index not in saved and rng()<rate:board[index]={'s':12,'m':2+weighted(rng,config['wildWeights'])}
  if not bonus:
   count=3 if rng()<config['bonusTrigger'] else weighted(rng,config['scatterCounts']);cols=[0,2,4]
   for j in range(count):
    k=j+int(rng()*(3-j));cols[j],cols[k]=cols[k],cols[j];board[int(rng()*3)*5+cols[j]]={'s':11}
 else:
  if len(forced_board)!=15:raise ValueError('Board must have 15 cells')
  board=[dict(c) for c in forced_board];stops=[]
  for i,c in enumerate(board):
   if c['s']<0 or c['s']>12 or c['s']==11 and i%5 not in (0,2,4) or c['s']==12 and (i%5 not in (1,2,3) or c.get('m') not in (2,3)):raise ValueError('Forbidden symbol position')
 for index,mult in saved.items():board[index]={'s':12,'m':mult}
 new=[i for i,c in enumerate(board) if c['s']==12 and i not in saved] if bonus else []
 if bonus:
  for i in new:saved[i]=board[i]['m']
 scatters=sum(c['s']==11 for c in board);line_pay,line_wins=evaluate(board,config['paytable']);scatter_pay=500 if not bonus and scatters>=3 else 0;wheel=[1+weighted(rng,config['wheelWeights']) for _ in range(9)] if not bonus and scatters>=3 else []
 uncapped=line_pay+scatter_pay;payout=min(max(0,remaining_cap),uncapped)
 windows=[]
 if trace and stops:
  for col,strip in enumerate(strips):
   visible=[dict(c) for c in board[col::5]];windows.append([{'s':strip[(stops[col]-12+i)%len(strip)]} for i in range(12)]+visible)
 return {'board':board,'lineWins':line_wins,'lineHundredths':line_pay,'scatterHundredths':scatter_pay,'payoutHundredths':payout,'sticky':{str(k):v for k,v in saved.items()},'newSticky':new,'scatters':scatters,'wheel':wheel,'bonusSpins':sum(wheel),'capped':uncapped>=remaining_cap,'reelStops':stops,'reelWindows':windows,'modelVersion':config['version']}
