"""Original Kovboy: 5x4 / 40 fixed lines, additive sticky wilds and overlays."""
import json,secrets
from pathlib import Path
CONFIG=json.loads(Path(__file__).with_name('kovboy-math.json').read_text())
KEYS=['ten','jack','queen','king','ace','holster','gold-bag','cowgirl','deputy','sheriff','wild','scatter']
WILD=10;SCATTER=11;CAP=1000000
LINES=CONFIG['lines'];PAY=CONFIG['paytable'];EXTRA={2:4,3:8,4:12,5:20}

def weighted(rng,weights):
 value=rng()*sum(weights)
 for i,w in enumerate(weights):
  value-=w
  if value<0:return i
 return len(weights)-1

def evaluate(board,paytable=PAY):
 wins=[]
 for number,line in enumerate(LINES,1):
  indices=[line[col]*5+col for col in range(5)];symbol=board[indices[0]]['s']
  if symbol>=WILD:continue
  count=0;multiplier=0
  for index in indices:
   cell=board[index]
   if cell['s'] not in (symbol,WILD):break
   count+=1
   if cell['s']==WILD:multiplier+=cell['m']
  if count>=3:
   base=paytable[symbol][count-3];wins.append({'line':number,'symbol':KEYS[symbol],'count':count,'indices':indices[:count],'baseHundredths':base,'multiplier':max(1,multiplier),'payHundredths':base*max(1,multiplier)})
 return sum(w['payHundredths'] for w in wins),wins

def spin(*,bonus=False,sticky=None,remaining_cap=CAP,rng=None,config=CONFIG,forced_board=None,forced_overlays=None,trace=True,model_version=None):
 if model_version not in (None,config['version']):raise ValueError('Unsupported Kovboy version')
 rng=rng or secrets.SystemRandom().random
 saved={int(k):int(v) for k,v in (sticky or {}).items()} if bonus else {}
 if any(i<0 or i>=20 or i%5 not in (1,2,3) or m not in (2,3,5) for i,m in saved.items()):raise ValueError('Invalid sticky cells')
 stops=[]
 if forced_board is None:
  strips=config['bonusReels'] if bonus else config['baseReels'];stops=[int(rng()*len(strip)) for strip in strips]
  board=[{'s':strips[col][(stops[col]+row)%len(strips[col])]} for row in range(4) for col in range(5)]
  rate=config['bonusWildRate'] if bonus else config['wildRate']
  for i in range(20):
   if i%5 in (1,2,3) and i not in saved and rng()<rate:board[i]={'s':WILD,'m':[2,3,5][weighted(rng,config['wildWeights'])]}
  if not bonus:
   count=3 if rng()<config['bonusTrigger'] else weighted(rng,config['scatterCounts']);cols=[0,2,4]
   for j in range(count):
    k=j+int(rng()*(3-j));cols[j],cols[k]=cols[k],cols[j];board[int(rng()*4)*5+cols[j]]={'s':SCATTER}
 else:
  if len(forced_board)!=20:raise ValueError('20 cells required')
  board=[dict(c) for c in forced_board]
  for i,c in enumerate(board):
   if c['s'] not in range(12) or c['s']==SCATTER and i%5 not in (0,2,4) or c['s']==WILD and (i%5 not in (1,2,3) or c.get('m') not in (2,3,5)):raise ValueError('Forbidden symbol position')
 for index,multiplier in saved.items():board[index]={'s':WILD,'m':multiplier}
 new=[i for i,c in enumerate(board) if c['s']==WILD and i not in saved] if bonus else []
 for i in new:saved[i]=board[i]['m']
 overlays=[]
 if bonus:
  count=weighted(rng,config['overlayCounts']) if forced_overlays is None else len(forced_overlays)
  if forced_overlays is not None:
   overlays=list(forced_overlays)
   if len(overlays)>5 or len(set(overlays))!=len(overlays) or any(i not in range(20) for i in overlays):raise ValueError('Invalid overlays')
  else:
   positions=list(range(20))
   for i in range(count):
    j=i+int(rng()*(20-i));positions[i],positions[j]=positions[j],positions[i];overlays.append(positions[i])
 payout,wins=evaluate(board,config['paytable']);scatters=sum(c['s']==SCATTER for c in board);windows=[]
 if trace and stops:
  for col,strip in enumerate(strips):windows.append([{'s':strip[(stops[col]-12+i)%len(strip)]} for i in range(12)]+[dict(c) for c in board[col::5]])
 return {'board':board,'lineWins':wins,'lineHundredths':payout,'payoutHundredths':min(max(0,remaining_cap),payout),'sticky':{str(k):v for k,v in saved.items()},'newSticky':new,'scatters':scatters,'bonusSpins':8 if not bonus and scatters>=3 else 0,'overlays':overlays,'extraSpins':EXTRA.get(len(overlays),0),'capped':payout>=remaining_cap,'reelStops':stops,'reelWindows':windows,'modelVersion':config['version'],'guaranteeHundredths':0}
