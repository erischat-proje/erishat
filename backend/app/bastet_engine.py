"""Original Bastet 5x4 engine. Each unpaid respin is resumable, never a blocking loop."""
import json,secrets,math
from pathlib import Path
CONFIG=json.loads(Path(__file__).with_name('bastet-math.json').read_text())
KEYS=['ten','jack','queen','king','ace','scarab','ankh','chalice','cat-white','cat-black','wild','scatter']
WILD=10;SCATTER=11;CAP=500000;LINES=CONFIG['lines'];PAY=CONFIG['paytable'];AWARDS={3:8,4:12,5:16}

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
  count=0;multiplier=1
  for index in indices:
   cell=board[index]
   if cell['s'] not in (symbol,WILD):break
   count+=1
   if cell['s']==WILD:multiplier*=cell.get('m',1)
  if count>=3:
   base=paytable[symbol][count-3]
   wins.append({'line':number,'symbol':KEYS[symbol],'count':count,'indices':indices[:count],'baseHundredths':base,'multiplier':multiplier,'payHundredths':base*multiplier})
 return sum(w['payHundredths'] for w in wins),wins

def spin(*,bonus=False,sticky=None,locked=None,respin=False,remaining_cap=CAP,rng=None,config=CONFIG,forced_board=None,trace=True,model_version=None):
 if model_version not in (None,config['version']):raise ValueError('Unsupported Bastet version')
 rng=rng or secrets.SystemRandom().random
 saved={int(k):int(v) for k,v in (sticky or {}).items()} if bonus else {}
 if any(i not in range(20) or i%5==0 or m not in (2,3) for i,m in saved.items()):raise ValueError('Invalid sticky wild')
 locks={int(k):dict(v) for k,v in (locked or {}).items()} if respin else {}
 if respin and (any(i not in range(20) or c.get('s') not in (8,9,WILD) for i,c in locks.items()) or any(locks.get(i,{}).get('s') not in (8,9) for i in [0,5,10,15]) or len({locks[i]['s'] for i in [0,5,10,15]})!=1):raise ValueError('Invalid respin locks')
 if forced_board is None:
  board=[{'s':weighted(rng,config['weights'])} for _ in range(20)]
  if not respin and rng()<(config['bonusStackRate'] if bonus else config['stackRate']):
   cat=8+int(rng()*2)
   for i in [0,5,10,15]:board[i]={'s':cat}
  rate=config['bonusWildRate'] if bonus else config['wildRate']
  for i in range(20):
   if i%5 and i not in saved and i not in locks and rng()<rate:board[i]={'s':WILD,'m':2+int(rng()*2)} if bonus else {'s':WILD,'m':1}
  if not bonus and not respin:
   trigger=rng()<config['bonusTrigger']
   count=3 if trigger else (1 if rng()<.15 else 0)
   if trigger and rng()<.04:count=4 if rng()<.95 else 5
   columns=list(range(5))
   for j in range(count):
    k=j+int(rng()*(5-j));columns[j],columns[k]=columns[k],columns[j];board[int(rng()*4)*5+columns[j]]={'s':SCATTER}
 else:
  if len(forced_board)!=20:raise ValueError('20 cells required')
  board=[dict(c) for c in forced_board]
  for i,c in enumerate(board):
   if c.get('s') not in range(12) or c['s']==WILD and (i%5==0 or c.get('m') not in ((2,3) if bonus else (1,))):raise ValueError('Invalid symbol')
 for i,m in saved.items():board[i]={'s':WILD,'m':m}
 for i,c in locks.items():board[i]=c
 new=[i for i,c in enumerate(board) if c['s']==WILD and i not in saved] if bonus else []
 for i in new:saved[i]=board[i]['m']
 stack=board[0]['s'] in (8,9) and all(board[i]['s']==board[0]['s'] for i in [5,10,15])
 payout,wins=evaluate(board,config['paytable'])
 needs_respin=(respin or stack) and not wins
 if needs_respin:
  cat=board[0]['s']
  locks={i:dict(c) for i,c in enumerate(board) if c['s'] in (cat,WILD)}
 else:locks={}
 scatters=sum(c['s']==SCATTER for c in board)
 windows=[[{'s':weighted(rng,config['weights'])} for _ in range(12)]+[dict(c) for c in board[col::5]] for col in range(5)] if trace else []
 return {'board':board,'lineWins':wins,'lineHundredths':payout,'payoutHundredths':min(max(0,remaining_cap),payout),'sticky':{str(i):m for i,m in saved.items()},'newSticky':new,'scatters':scatters,'bonusSpins':AWARDS.get(min(5,scatters),0) if not bonus and not respin else 0,'extraSpins':2 if bonus and stack and not respin else 0,'respin':needs_respin,'respinBonus':bonus,'locked':{str(i):c for i,c in locks.items()},'stack':stack,'capped':payout>=remaining_cap,'reelWindows':windows,'modelVersion':config['version'],'overlays':[],'guaranteeHundredths':0}
