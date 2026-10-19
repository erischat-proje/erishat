"""Original 25-line Copy Reels and four-grid Hold & Win engine.
All amounts are hundredths of the locked stake; no production client RNG.
"""
import json,secrets,copy
from pathlib import Path
CONFIG=json.loads(Path(__file__).with_name('altin-math.json').read_text())
KEYS=['nine','ten','jack','queen','king','ace','harp','mushroom','horseshoe','unicorn','leprechaun','tree','pot']
WILD=11;MONEY=12;CAP=516300;LINES=CONFIG['lines'];PAY=CONFIG['paytable'];JACKPOTS=[2000,5000,20000,500000]

def weighted(rng,weights):
 v=rng()*sum(weights)
 for i,w in enumerate(weights):
  v-=w
  if v<0:return i
 return len(weights)-1

def pot(rng,config=CONFIG,purchased=False):return {'kind':'pot','value':config['buyPotValues' if purchased else 'potValues'][weighted(rng,config['potWeights'])]}

def evaluate(board,paytable=PAY):
 wins=[]
 for number,line in enumerate(LINES,1):
  ids=[line[c]*5+c for c in range(5)];symbol=board[ids[0]]['s']
  if symbol>=WILD:continue
  count=0
  for i in ids:
   if board[i]['s'] not in (symbol,WILD):break
   count+=1
  if count>=3:
   value=paytable[symbol][count-3]
   wins.append({'line':number,'symbol':KEYS[symbol],'count':count,'indices':ids[:count],'payHundredths':value,'multiplier':1})
 return sum(w['payHundredths'] for w in wins),wins

def start_bonus(pots=None,*,rng=None,config=CONFIG,purchased=False):
 rng=rng or secrets.SystemRandom().random
 values=list(pots) if pots is not None else [pot(rng,config,purchased)['value'] for _ in range(config['buyPots'])]
 if len(values)<6 or len(values)>15 or any(not isinstance(v,int) or v<0 for v in values):raise ValueError('6..15 initial pots required')
 boards=[[None]*15 for _ in range(4)];placed=[]
 # Seed one pot on each board, then distribute remaining pots without duplication.
 order=list(range(4))
 for j in range(4):k=j+int(rng()*(4-j));order[j],order[k]=order[k],order[j]
 for j,value in enumerate(values):
  candidates=[(order[j],i) for i in range(15)] if j<4 else [(g,i) for g in range(4) for i in range(15) if boards[g][i] is None]
  g,i=candidates[int(rng()*len(candidates))];boards[g][i]={'kind':'pot','value':value};placed.append({'grid':g,'index':i,'kind':'pot','value':value})
 return {'boards':boards,'remaining':8,'awarded':8,'jackpots':[False]*4,'previewHundredths':sum(values),'placements':placed,'purchased':bool(purchased),'version':config['version']}

def spin(*,rng=None,config=CONFIG,forced_board=None,forced_copy=None,remaining_cap=CAP,trace=True,model_version=None):
 if model_version not in (None,config['version']):raise ValueError('Unsupported Altın Şöleni version')
 rng=rng or secrets.SystemRandom().random
 if forced_board is None:
  board=[{'s':weighted(rng,config['weights'])} for _ in range(15)]
  if rng()<config['stackRate']:
   s=6+int(rng()*5)
   for i in [0,5,10]:board[i]={'s':s}
  for i in range(15):
   if i%5 in (1,2,3) and rng()<config['wildRate']:board[i]={'s':WILD}
  trigger=rng()<config['bonusTrigger'];count=6+weighted(rng,config['triggerCounts']) if trigger else weighted(rng,config['moneyCounts'])
  candidates=list(range(15))
  for j in range(count):
   k=j+int(rng()*(15-j));candidates[j],candidates[k]=candidates[k],candidates[j];board[candidates[j]]={'s':MONEY,'value':pot(rng,config)['value']}
 else:
  if len(forced_board)!=15:raise ValueError('15 cells required')
  board=copy.deepcopy(forced_board)
 for i,c in enumerate(board):
  if c.get('s') not in range(13) or c['s']==WILD and i%5 not in (1,2,3) or c['s']==MONEY and (not isinstance(c.get('value'),int) or c['value']<0):raise ValueError('Invalid base symbol')
 before=copy.deepcopy(board);stack=board[0]['s'] in range(6,11) and all(board[i]['s']==board[0]['s'] for i in [5,10]);columns=[]
 if stack:
  if forced_copy is None:
   n=1+weighted(rng,config['copyCounts']);available=[1,2,3,4]
   for j in range(n):k=j+int(rng()*(4-j));available[j],available[k]=available[k],available[j]
   columns=available[:n]
  else:
   columns=list(forced_copy)
   if not columns or len(set(columns))!=len(columns) or any(c not in (1,2,3,4) for c in columns):raise ValueError('Invalid copy targets')
  for col in columns:
   for row in range(3):board[row*5+col]=dict(board[row*5])
 payout,wins=evaluate(board,config['paytable']);money=[c['value'] for c in board if c['s']==MONEY]
 windows=[[{'s':weighted(rng,config['weights'])} for _ in range(12)]+[dict(c) for c in before[col::5]] for col in range(5)] if trace else []
 return {'board':board,'beforeCopy':before,'copyColumns':columns,'lineWins':wins,'moneyCount':len(money),'bonus':start_bonus(money,rng=rng,config=config) if len(money)>=6 and payout<remaining_cap else None,'payoutHundredths':min(max(0,remaining_cap),payout),'capped':payout>=remaining_cap,'modelVersion':config['version'],'reelWindows':windows}

def respin(state,*,rng=None,config=CONFIG,remaining_cap=CAP,forced_events=None):
 if state.get('version')!=config['version']:raise ValueError('Unsupported bonus version')
 if state['remaining']<=0:raise ValueError('Bonus finished')
 rng=rng or secrets.SystemRandom().random;out=copy.deepcopy(state);boards=out['boards'];jackpots=out['jackpots']
 if len(boards)!=4 or any(len(b)!=15 for b in boards) or len(jackpots)!=4:raise ValueError('Invalid four grids')
 out['remaining']-=1;events=[];added=0;new_jackpots=[]
 if forced_events is not None:
  events_to_apply=list(forced_events)
  if len({(e['grid'],e['index']) for e in events_to_apply})!=len(events_to_apply):raise ValueError('Duplicate landing')
 else:
  events_to_apply=[]
  for g,board in enumerate(boards):
   if jackpots[g]:continue
   for i,cell in enumerate(board):
    if cell is not None or rng()>=(config['buyLandingRate'] if state.get('purchased') else config['landingRate']):continue
    kind=weighted(rng,config['landingWeights'])
    cell=pot(rng,config,state.get('purchased',False)) if kind==0 else {'kind':'multiplier','multiplier':config['multipliers'][weighted(rng,config['multiplierWeights'])]} if kind==1 else {'kind':'extra'}
    events_to_apply.append({'grid':g,'index':i,**cell})
 for e in events_to_apply:
  g,i=e['grid'],e['index']
  if g not in range(4) or i not in range(15) or boards[g][i] is not None or jackpots[g]:raise ValueError('Landing on locked cell')
  kind=e['kind']
  if kind=='pot':
   if not isinstance(e.get('value'),int) or e['value']<0:raise ValueError('Invalid pot')
   boards[g][i]={'kind':'pot','value':e['value']}
  elif kind=='multiplier':
   m=e['multiplier']
   if m not in (2,3,5,10,25):raise ValueError('Invalid multiplier')
   boards[g][i]={'kind':'multiplier','multiplier':m}
   targets=[j for j,c in enumerate(boards[g]) if c and c['kind']=='pot']
   if targets:
    target=e.get('target',targets[int(rng()*len(targets))])
    if target not in targets:raise ValueError('Invalid multiplier target')
    old=boards[g][target]['value'];boards[g][target]['value']=min(CAP,old*m);e={**e,'target':target,'oldValue':old,'newValue':boards[g][target]['value']}
  elif kind=='extra':boards[g][i]={'kind':'extra'};added+=1
  else:raise ValueError('Unknown landing')
  events.append(dict(e))
  if not jackpots[g] and all(c is not None for c in boards[g]):jackpots[g]=True;new_jackpots.append(g)
  preview=sum(c['value'] for b in boards for c in b if c and c['kind']=='pot')+sum(JACKPOTS[j] for j,v in enumerate(jackpots) if v)
  if preview>=remaining_cap:break
 for g,board in enumerate(boards):
  if not jackpots[g] and all(c is not None for c in board):jackpots[g]=True;new_jackpots.append(g)
 out['remaining']+=added;out['awarded']+=added
 preview=sum(c['value'] for b in boards for c in b if c and c['kind']=='pot')+sum(JACKPOTS[g] for g,v in enumerate(jackpots) if v)
 out['previewHundredths']=preview;out.pop('placements',None)
 capped=preview>=remaining_cap
 finished=capped or out['remaining']==0 or all(jackpots)
 if finished:out['remaining']=0
 return {'bonus':out,'events':events,'extraSpins':added,'newJackpots':new_jackpots,'finished':finished,'payoutHundredths':min(max(0,remaining_cap),preview) if finished else 0,'capped':capped,'modelVersion':config['version']}
