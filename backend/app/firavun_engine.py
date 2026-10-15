"""Original Book/expanding game. Wins have normal, scatter and expansion phases."""
import json,secrets
from pathlib import Path
CONFIG=json.loads(Path(__file__).with_name('firavun-math.json').read_text())
KEYS=['ten','jack','queen','king','ace','scarab','cat','mask','explorer','book'];BOOK=9;CAP=500000
LINES=[[1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],[0,1,2,1,0],[2,1,0,1,2],[0,0,1,2,2],[2,2,1,0,0],[1,0,0,0,1],[1,2,2,2,1],[0,1,1,1,0]]
PAY=CONFIG['paytable']
def weighted(rng,weights):
 value=rng()*sum(weights)
 for i,w in enumerate(weights):
  value-=w
  if value<0:return i
 return len(weights)-1

def choose_special(rng=None):return weighted(rng or secrets.SystemRandom().random,CONFIG['specialWeights'])

def evaluate(board,paytable=PAY):
 wins=[]
 for number,line in enumerate(LINES,1):
  indices=[line[col]*5+col for col in range(5)];best=None
  for symbol in (range(9) if board[indices[0]]['s']==BOOK else [board[indices[0]]['s']]):
   count=0
   for i in indices:
    if board[i]['s'] not in (symbol,BOOK):break
    count+=1
   if count<2:continue
   amount=paytable[symbol][count-2]
   if amount and (best is None or amount>best['payHundredths']):best={'line':number,'symbol':KEYS[symbol],'count':count,'indices':indices[:count],'payHundredths':amount}
  if best:wins.append(best)
 return sum(w['payHundredths'] for w in wins),wins

def expand(board,special,paytable=PAY):
 if special not in range(9):raise ValueError('Invalid special symbol')
 columns=[col for col in range(5) if any(board[row*5+col]['s']==special for row in range(3))]
 needed=3 if special<5 else 2
 if len(columns)<needed:return 0,[],[dict(c) for c in board]
 # Count qualifying reels, never duplicate cells on the same reel or Book Wilds.
 amount=paytable[special][len(columns)-2]*len(LINES);expanded=[dict(c) for c in board]
 for col in columns:
  for row in range(3):expanded[row*5+col]={'s':special}
 return amount,columns,expanded

def spin(*,bonus=False,purchased=False,special=None,remaining_cap=CAP,rng=None,config=CONFIG,forced_board=None,forced_books=None,trace=True,model_version=None):
 if model_version not in (None,config['version']):raise ValueError('Unsupported Firavun version')
 if bonus and special not in range(9):raise ValueError('Special symbol required')
 rng=rng or secrets.SystemRandom().random;stops=[]
 if forced_board is None:
  reels=(config['buyBonusReels'] if purchased else config['bonusReels'])[special] if bonus else config['baseReels'];stops=[int(rng()*len(strip)) for strip in reels]
  board=[{'s':reels[col][(stops[col]+row)%len(reels[col])]} for row in range(3) for col in range(5)]
  if forced_books is not None:count=forced_books
  else:count=3+weighted(rng,config['triggerBookWeights']) if rng()<(config['retrigger'] if bonus else config['bonusTrigger']) else weighted(rng,config['bookCounts'])
  if count not in range(6):raise ValueError('Invalid Book count')
  cols=list(range(5))
  for i in range(count):
   j=i+int(rng()*(5-i));cols[i],cols[j]=cols[j],cols[i];board[int(rng()*3)*5+cols[i]]={'s':BOOK}
 else:
  if len(forced_board)!=15:raise ValueError('15 cells required')
  board=[dict(c) for c in forced_board]
  if any(c['s'] not in range(10) for c in board):raise ValueError('Invalid symbol')
 line_pay,line_wins=evaluate(board,config['paytable']);books=sum(c['s']==BOOK for c in board);scatter_pay=([200,2000,20000][min(5,books)-3] if books>=3 else 0)
 scatter_pay=round(scatter_pay*config.get('naturalRewardFactor',1))
 expansion,columns,expanded=expand(board,special,config['paytable']) if bonus else (0,[],[dict(c) for c in board])
 uncapped=line_pay+scatter_pay+expansion;windows=[]
 if trace and stops:
  for col,strip in enumerate(reels):windows.append([{'s':strip[(stops[col]-12+i)%len(strip)]} for i in range(12)]+[dict(c) for c in board[col::5]])
 return {'board':board,'expandedBoard':expanded,'lineWins':line_wins,'lineHundredths':line_pay,'scatterHundredths':scatter_pay,'expansionHundredths':expansion,'expandColumns':columns,'special':special if bonus else None,'books':books,'bonusSpins':10 if not bonus and books>=3 else 0,'extraSpins':10 if bonus and books>=3 else 0,'payoutHundredths':min(max(0,remaining_cap),uncapped),'capped':uncapped>=remaining_cap,'reelWindows':windows,'reelStops':stops,'modelVersion':config['version']}
