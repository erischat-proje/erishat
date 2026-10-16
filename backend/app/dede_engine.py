"""Original Dede pay-anywhere engine. No user-specific odds or client outcomes."""
from pathlib import Path
import json,secrets

CONFIG=json.loads(Path(__file__).with_name('dede-math.json').read_text())
KEYS=['blue','green','yellow','purple','red','cup','ring','hourglass','crown']
PAY=[[25,75,200],[40,90,400],[50,100,500],[80,150,800],[100,200,1000],[150,200,1200],[200,500,1500],[300,1000,2500],[1000,1500,5000]]

def weighted(rng,weights):
    p=rng()*sum(weights)
    for i,w in enumerate(weights):
        p-=w
        if p<0:return i
    return len(weights)-1

def evaluate(board,paytable=PAY):
    counts=[0]*9
    for c in board:
        if c['s']<9:counts[c['s']]+=1
    wins=[];amount=0
    for s,n in enumerate(counts):
        if n>=8:
            pay=paytable[s][2 if n>=12 else 1 if n>=10 else 0]
            amount+=pay;wins.append({'symbol':KEYS[s],'count':n,'pay':pay/100})
    return amount,wins

def spin(*,bonus=False,pool=0,ante=False,remaining_cap=500000,rng=None,config=CONFIG,trace=True,forced_scatters=None):
    rng=rng or secrets.SystemRandom().random
    rate=config['bonusOrbRate'] if bonus else config['anteOrbRate'] if ante else config['orbRate']
    weights=config['bonusWeights'] if bonus else config['weights']
    def fresh():
        return {'s':10,'m':config['orbValues'][weighted(rng,config['orbWeights'])]} if rng()<rate else {'s':weighted(rng,weights)}
    board=[fresh() for _ in range(30)]
    if forced_scatters is not None:scatters=forced_scatters
    elif bonus:scatters=3 if rng()<config['retrigger'] else weighted(rng,[55,35,10])
    else:scatters=4+weighted(rng,[985,14,1]) if rng()<config['bonusTrigger']*(2 if ante else 1) else weighted(rng,[55,35,10])
    positions=list(range(30))
    for i in range(scatters):
        j=i+int(rng()*(30-i));positions[i],positions[j]=positions[j],positions[i];board[positions[i]]={'s':9}
    raw=0;steps=[];tumbles=0;amount,wins=evaluate(board,config.get('paytable',PAY))
    scatter_pay=([300,500,10000][min(6,scatters)-4] if not bonus and scatters>=4 else 0)
    while amount>0:
        raw+=amount;hit={KEYS.index(w['symbol']) for w in wins};removed=[i for i,c in enumerate(board) if c['s'] in hit]
        if trace:steps.append({'board':[dict(c) for c in board],'wins':wins,'removed':removed,'win':amount/100})
        current=sum(c['m'] for c in board if c['s']==10)
        if raw*max(1,pool+current if bonus else current)+scatter_pay>=remaining_cap:break
        new=[None]*30
        for col in range(6):
            survivors=[board[row*6+col] for row in range(5) if board[row*6+col]['s'] not in hit];n=5-len(survivors)
            for row in range(5):new[row*6+col]=fresh() if row<n else survivors[row-n]
        board=new;tumbles+=1;amount,wins=evaluate(board,config.get('paytable',PAY))
        if tumbles>1000:raise RuntimeError('Tumble safety limit')
    multipliers=[c['m'] for c in board if c['s']==10];total=sum(multipliers)
    new_pool=pool+total if bonus and raw>0 else pool
    applied=max(1,new_pool if bonus else total)
    uncapped=raw*applied+scatter_pay;payout=min(remaining_cap,uncapped)
    if trace:steps.append({'board':[dict(c) for c in board],'wins':[],'removed':[],'win':0})
    return {'steps':steps,'payoutHundredths':payout,'payout':payout/100,'raw':raw/100,'scatterPay':scatter_pay/100,'scatters':scatters,'multipliers':multipliers,'applied':applied,'pool':new_pool,'bonusTriggered':not bonus and scatters>=4,'extraSpins':5 if bonus and scatters>=3 else 0,'capped':uncapped>=remaining_cap,'tumbles':tumbles}
