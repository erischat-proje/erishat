"""Original Candy Ultimate cluster math; positional state stays server-owned."""
import json,secrets
from pathlib import Path
LEGACY_CONFIG=json.loads(Path(__file__).with_name('candy-math.json').read_text())
CONFIG=json.loads(Path(__file__).with_name('candy-math-v2.json').read_text())
SUPPORTED_VERSIONS=frozenset((LEGACY_CONFIG['version'],CONFIG['version']))
KEYS=['orange-bear','purple-bear','red-bear','star','bottle','bean','heart']
# Hundredths of total bet, buckets 5,6,7,8-9,10-11,12-14,15+.
PAY=[[20,30,40,60,100,200,2000],[25,35,50,75,150,300,2500],[30,40,60,90,200,400,3000],[40,60,80,120,300,600,4000],[50,75,100,150,400,800,6000],[75,100,150,250,500,1000,10000],[100,150,200,300,750,1500,15000]]
FS=[10,12,15,20,30]
def weighted(rng,weights):
    value=rng()*sum(weights)
    for i,w in enumerate(weights):
        value-=w
        if value<0:return i
    return len(weights)-1

def clusters(board):
    if len(board)!=49:raise ValueError('49 cells required')
    visited=set();result=[]
    for start,symbol in enumerate(board):
        if start in visited or symbol>=7:continue
        stack=[start];visited.add(start);group=[]
        while stack:
            i=stack.pop();group.append(i);r,c=divmod(i,7)
            for j in ([i-7] if r else [])+([i+7] if r<6 else [])+([i-1] if c else [])+([i+1] if c<6 else []):
                if j not in visited and board[j]==symbol:visited.add(j);stack.append(j)
        if len(group)>=5:result.append((symbol,group))
    return result

def evaluate(board,spots,paytable=PAY):
    wins=[]
    for s,cells in clusters(board):
        n=len(cells);bucket=0 if n==5 else 1 if n==6 else 2 if n==7 else 3 if n<10 else 4 if n<12 else 5 if n<15 else 6
        base=paytable[s][bucket];multiplier=sum(spots[i] for i in cells if spots[i]>=2) or 1
        wins.append({'symbol':s,'cells':cells,'count':n,'base':base/100,'multiplier':multiplier,'win':base*multiplier/100,'hundredths':base*multiplier})
    return wins

def spin(*,bonus=False,spots=None,ante=False,remaining_cap=500000,rng=None,trace=True,forced_board=None,forced_scatters=None,config=CONFIG,model_version=None):
    if model_version==LEGACY_CONFIG['version']:config=LEGACY_CONFIG
    elif model_version not in (None,config['version']):raise ValueError('Unsupported Candy version')
    rng=rng or secrets.SystemRandom().random
    marks=list(spots) if bonus and spots is not None else [0]*49
    if len(marks)!=49 or any(v not in [0,1,2,4,8,16,32,64,128,256,512,1024] for v in marks):raise ValueError('Invalid server spots')
    weights=config['bonusWeights'] if bonus else config['weights']
    fresh=lambda:weighted(rng,weights)
    board=list(forced_board) if forced_board is not None else [fresh() for _ in range(49)]
    if forced_scatters is not None:n=forced_scatters
    elif bonus:n=0 # Classic feature: no free-spin retrigger in this original profile.
    else:n=3+weighted(rng,config['scatterBonusWeights']) if rng()<(config['anteBonusTrigger'] if ante else config['bonusTrigger']) else weighted(rng,[65,30,5])
    if forced_board is None:
        indices=list(range(49))
        for i in range(n):
            j=i+int(rng()*(49-i));indices[i],indices[j]=indices[j],indices[i];board[indices[i]]=7
    scatters=sum(s==7 for s in board);steps=[];payout=0;tumbles=0;capped=False
    while True:
        wins=evaluate(board,marks,config.get('paytable',PAY));before=list(marks);removed=sorted({i for w in wins for i in w['cells']});win=sum(w['hundredths'] for w in wins)
        if trace:steps.append({'board':list(board),'spots':before,'wins':wins,'removed':removed,'win':min(win,max(0,remaining_cap-payout))/100})
        if not removed:break
        payout+=win
        for i in removed:marks[i]=1 if marks[i]==0 else min(1024,2 if marks[i]==1 else marks[i]*2)
        if trace:steps[-1]['nextSpots']=list(marks)
        if payout>=remaining_cap:capped=True;payout=remaining_cap;break
        hit=set(removed);new=[0]*49
        for col in range(7):
            survivors=[board[row*7+col] for row in range(7) if row*7+col not in hit];missing=7-len(survivors)
            for row in range(7):new[row*7+col]=fresh() if row<missing else survivors[row-missing]
        board=new;tumbles+=1
        if tumbles>1000:raise RuntimeError('Tumble limit exceeded; transaction must roll back')
    return {'steps':steps,'spots':marks,'board':board,'payoutHundredths':payout,'payout':payout/100,'scatters':scatters,'bonusTriggered':not bonus and scatters>=3,'bonusSpins':FS[min(7,scatters)-3] if not bonus and scatters>=3 else 0,'extraSpins':0,'capped':capped,'tumbles':tumbles,'pool':0,'modelVersion':config['version']}

def buy_spins(rng=None):return FS[weighted(rng or secrets.SystemRandom().random,CONFIG['scatterBonusWeights'])]
