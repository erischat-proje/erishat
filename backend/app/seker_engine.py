"""Original Lidya pay-anywhere cascade engine. Amounts are integer hundredths of stake."""
import json,secrets
from pathlib import Path
CONFIG=json.loads(Path(__file__).with_name('seker-math.json').read_text())
KEYS=['banana','apple','grapes','plum','watermelon','blue','green','purple','heart']
PAY=[[25,75,200],[40,90,400],[50,100,500],[80,150,800],[100,200,1000],[150,200,1200],[200,500,1500],[300,1000,2500],[1000,2500,5000]]
CAP=2110000

def weighted(rng,weights):
    p=rng()*sum(weights)
    for i,w in enumerate(weights):
        p-=w
        if p<0:return i
    return len(weights)-1

def evaluate(board):
    counts=[0]*9
    for cell in board:
        if cell['s']<9:counts[cell['s']]+=1
    wins=[{'symbol':KEYS[s],'count':n,'payHundredths':PAY[s][2 if n>=12 else 1 if n>=10 else 0]} for s,n in enumerate(counts) if n>=8]
    return sum(w['payHundredths'] for w in wins),wins

def spin(*,bonus=False,ante=False,remaining_cap=CAP,rng=None,config=CONFIG,trace=True,forced_board=None):
    rng=rng or secrets.SystemRandom().random
    # A weighted symbol family is selected per spin. Conditional symbol draws are independent.
    # This published family mixture creates high volatility without user-specific probabilities.
    family=weighted(rng,config.get('bonusFamilyWeights',config['familyWeights']) if bonus else config.get('anteFamilyWeights',config['familyWeights']) if ante else config['familyWeights'])
    weights=list(config['weights']);weights[family]*=config['familyBoost']
    rate=config['bombRate'] if bonus else 0
    def fresh():
        if bonus and rng()<rate:return {'s':10,'m':config['bombValues'][weighted(rng,config['bombWeights'])]}
        return {'s':weighted(rng,weights)}
    board=[fresh() for _ in range(30)] if forced_board is None else [dict(c) for c in forced_board]
    # Scatter count distribution has doubled trigger mass under Ante; it is not a claim
    # that independently doubling per-cell scatter probability doubles bonus probability.
    scatter_weights=config['bonusScatters'] if bonus else config['anteScatters'] if ante else config['scatters']
    if forced_board is None:
        count=weighted(rng,scatter_weights)
        positions=list(range(30))
        for i in range(count):
            j=i+int(rng()*(30-i));positions[i],positions[j]=positions[j],positions[i];board[positions[i]]={'s':9}
    scatters=sum(c['s']==9 for c in board)
    scatter_pay=([300,500,10000][min(6,scatters)-4] if not bonus and scatters>=4 else 0)
    raw=0;steps=[];tumbles=0
    while True:
        amount,wins=evaluate(board)
        hit={KEYS.index(w['symbol']) for w in wins}
        removed=[i for i,c in enumerate(board) if c['s'] in hit]
        current=sum(c.get('m',0) for c in board if c['s']==10)
        reaches=raw+amount>0 and (raw+amount)*max(1,current)+scatter_pay>=remaining_cap
        if trace:steps.append({'board':[dict(c) for c in board],'wins':wins,'removed':removed,'winHundredths':amount,'terminal':amount==0 or reaches})
        raw+=amount
        if not amount or reaches:break
        new=[None]*30
        for col in range(6):
            survivors=[board[row*6+col] for row in range(5) if board[row*6+col]['s'] not in hit]
            n=5-len(survivors)
            for row in range(5):new[row*6+col]=fresh() if row<n else survivors[row-n]
        board=new;tumbles+=1
        if tumbles>1000:raise RuntimeError('Cascade safety limit; transaction must roll back')
    multipliers=[c['m'] for c in board if c['s']==10] if bonus else []
    applied=max(1,sum(multipliers)) if raw else 1
    uncapped=raw*applied+scatter_pay;payout=min(remaining_cap,uncapped)
    return {'steps':steps,'payoutHundredths':payout,'rawHundredths':raw,'scatterHundredths':scatter_pay,'scatters':scatters,'multipliers':multipliers,'applied':applied,'pool':0,'bonusTriggered':not bonus and scatters>=4,'extraSpins':5 if bonus and scatters>=3 else 0,'capped':uncapped>=remaining_cap,'tumbles':tumbles}
