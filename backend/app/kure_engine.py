"""Original variable-height ways+tumble engine, with one top cell on reels 2..5.
Wild doubles only combinations that use it, once, regardless of number of Wilds.
"""
import json,secrets,math,copy
from pathlib import Path
CONFIG=json.loads(Path(__file__).with_name('kure-math.json').read_text())
KEYS=['ten','jack','queen','king','ace','tarot','candles','potion','cat','owl','ball','seer']
SCATTER=10;WILD=11;CAP=500000;PAY=CONFIG['paytable'];FS=[5,8,10,12,15,20,12];MULT=[2,3,5,8,10,15,20,25];SCATTER_PAY={3:500,4:1000,5:2000,6:10000}

def weighted(rng,weights):
 v=rng()*sum(weights)
 for i,w in enumerate(weights):
  v-=w
  if v<0:return i
 return len(weights)-1

def ways(board,top):return math.prod(len(c)+(1 if 1<=i<=4 else 0) for i,c in enumerate(board))

def evaluate(board,top,paytable=PAY,multiplier=1):
 wins=[];removed=set();amount=0
 candidates=sorted({c['s'] for c in board[0] if c['s']<SCATTER})
 for symbol in candidates:
  count=0;normal_ways=1;total_ways=1;ids=[];wild_ids=[]
  for col in range(6):
   cells=[(str(col)+':'+str(i),c) for i,c in enumerate(board[col])]
   if 1<=col<=4:cells.append(('t:'+str(col-1),top[col-1]))
   normal=[i for i,c in cells if c['s']==symbol];wild=[i for i,c in cells if c['s']==WILD]
   if not normal and not wild:break
   count+=1;normal_ways*=len(normal);total_ways*=len(normal)+len(wild);ids.extend(normal+wild);wild_ids.extend(wild)
  if count>=3:
   wild_ways=total_ways-normal_ways;base=paytable[symbol][count-3];pay=base*(normal_ways+2*wild_ways)*multiplier
   wins.append({'symbol':KEYS[symbol],'count':count,'ways':total_ways,'normalWays':normal_ways,'wildWays':wild_ways,'baseHundredths':base,'wheelMultiplier':multiplier,'payHundredths':pay,'indices':ids,'wildIndices':wild_ids})
   amount+=pay;removed.update(ids)
 return amount,wins,sorted(removed)

def wheel(*,purchased=False,rng=None,config=CONFIG,forced=None):
 rng=rng or secrets.SystemRandom().random
 if forced is None:
  outer=weighted(rng,config['buyWheelSpinWeights' if purchased else 'wheelSpinWeights']);inner=weighted(rng,config['buyWheelMultiplierWeights' if purchased else 'wheelMultiplierWeights'])
 else:
  outer,inner=forced
  if outer not in range(7) or inner not in range(8):raise ValueError('Invalid wheel sector')
 return {'outerIndex':outer,'innerIndex':inner,'spins':FS[outer],'multiplier':MULT[inner],'spinSectors':FS,'multiplierSectors':MULT}

def spin(*,bonus=False,multiplier=1,ante=False,purchased=False,remaining_cap=CAP,rng=None,config=CONFIG,forced_heights=None,forced_board=None,forced_top=None,forced_refills=None,trace=True,model_version=None):
 if model_version not in (None,config['version']):raise ValueError('Unsupported Kure version')
 if not isinstance(multiplier,int) or multiplier<1:raise ValueError('Invalid wheel multiplier')
 rng=rng or secrets.SystemRandom().random
 heights=list(forced_heights) if forced_heights is not None else [2+weighted(rng,config['bonusHeightWeights'] if bonus else config['anteHeightWeights'] if ante else config['heightWeights']) for _ in range(6)]
 if len(heights)!=6 or any(not isinstance(h,int) or h<2 or h>7 for h in heights):raise ValueError('Six heights in 2..7 required')
 wild_rate=config['bonusWildRate'] if bonus else config['wildRate']
 weights=config['bonusWeights'] if bonus else config['weights']
 def fresh(col):return {'s':WILD} if col and rng()<wild_rate else {'s':weighted(rng,weights)}
 board=copy.deepcopy(forced_board) if forced_board is not None else [[fresh(col) for _ in range(h)] for col,h in enumerate(heights)]
 top=copy.deepcopy(forced_top) if forced_top is not None else [fresh(col) for col in range(1,5)]
 if len(board)!=6 or any(len(c)!=h for c,h in zip(board,heights)) or len(top)!=4:raise ValueError('Invalid grid shape')
 for col,cells in enumerate(board):
  for c in cells:
   if c.get('s') not in range(12) or col==0 and c['s']==WILD:raise ValueError('Invalid symbol')
 if any(c.get('s') not in range(12) or c['s']==SCATTER for c in top):raise ValueError('Scatter not allowed on top reel')
 if forced_board is None:
  if bonus:
   trigger=rng()<config['retrigger'];count=3+weighted(rng,config['scatterTriggerCounts']) if trigger else weighted(rng,config['scatterCounts'])
  else:count=1+weighted(rng,config['baseScatterCountWeights']) if rng()<config['scatterRate']*(2 if ante else 1) else 0
  columns=list(range(6))
  for j in range(count):
   k=j+int(rng()*(6-j));columns[j],columns[k]=columns[k],columns[j];col=columns[j];board[col][int(rng()*heights[col])]={'s':SCATTER}
 scatters=sum(c['s']==SCATTER for col in board for c in col)
 if scatters>6:raise ValueError('At most six Scatters')
 scatter_pay=round(SCATTER_PAY.get(scatters,0)*config.get('naturalRewardFactor',1))*(multiplier if bonus else 1)
 total=scatter_pay;steps=[];tumbles=0;initial=copy.deepcopy(board);initial_top=copy.deepcopy(top);applied=multiplier if bonus else 1
 while total<remaining_cap:
  amount,wins,removed=evaluate(board,top,config['paytable'],applied)
  if trace:steps.append({'board':copy.deepcopy(board),'top':copy.deepcopy(top),'wins':wins,'removed':removed,'payHundredths':amount,'ways':ways(board,top)})
  if not amount:break
  total+=amount
  if total>=remaining_cap:break
  hit=set(removed)
  if forced_refills is not None and tumbles<len(forced_refills):
   replacement=forced_refills[tumbles];board=copy.deepcopy(replacement['board']);top=copy.deepcopy(replacement['top'])
   if len(board)!=6 or any(len(c)!=h for c,h in zip(board,heights)) or len(top)!=4:raise ValueError('Invalid forced refill')
  else:
   for col in range(6):
    survivors=[c for i,c in enumerate(board[col]) if str(col)+':'+str(i) not in hit];board[col]=[fresh(col) for _ in range(heights[col]-len(survivors))]+survivors
   survivors=[c for i,c in enumerate(top) if 't:'+str(i) not in hit]
   # Top tracker shifts horizontally from left to right. New cells enter at left.
   top=[fresh(1) for _ in range(4-len(survivors))]+survivors
  tumbles+=1
  if tumbles>1000:raise RuntimeError('Unexpected tumble chain; no hidden payout truncation')
 if not steps and trace:steps=[{'board':copy.deepcopy(board),'top':copy.deepcopy(top),'wins':[],'removed':[],'payHundredths':0,'ways':ways(board,top)}]
 return {'heights':heights,'board':board,'top':top,'initialBoard':initial,'initialTop':initial_top,'steps':steps,'megaways':ways(board,top),'scatters':scatters,'scatterHundredths':scatter_pay,'payoutHundredths':min(max(0,remaining_cap),total),'capped':total>=remaining_cap,'tumbles':tumbles,'triggered':scatters>=3 and total<remaining_cap,'wheelMultiplier':applied,'modelVersion':config['version']}
