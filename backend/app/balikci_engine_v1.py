"""Original Lidya 10-line fisherman engine; integer hundredths of total stake."""
import json,secrets
from pathlib import Path
CONFIG=json.loads(Path(__file__).with_name('balikci-math-v1.json').read_text())
KEYS=['ten','jack','queen','king','ace','tackle','fly','rod','float','fish','scatter','fisherman']
# Each row index is 0=top, 1=middle, 2=bottom. Exactly ten fixed paylines.
LINES=[[1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],[0,1,2,1,0],[2,1,0,1,2],[0,0,1,2,2],[2,2,1,0,0],[1,0,0,0,1],[1,2,2,2,1],[0,1,1,1,0]]
PAY=[[50,250,1000]]*5+[[200,1000,5000],[300,2000,10000],[400,3000,15000],[500,4000,20000],[100,500,2000]]
CAP=210000
LEVELS=[1,2,3,10]

def weighted(rng,weights):
    p=rng()*sum(weights)
    for i,w in enumerate(weights):
        p-=w
        if p<0:return i
    return len(weights)-1

def evaluate(board):
    wins=[]
    for i,line in enumerate(LINES):
        indices=[line[col]*5+col for col in range(5)]
        best=None
        for symbol in range(10):
            count=0
            for index in indices:
                if board[index]['s'] in (symbol,11):count+=1
                else:break
            if count>=3:
                pay=PAY[symbol][count-3]
                if best is None or pay>best['payHundredths']:
                    best={'line':i+1,'symbol':KEYS[symbol],'count':count,'indices':indices[:count],'payHundredths':pay}
        if best:wins.append(best)
    return sum(w['payHundredths'] for w in wins),wins

def spin(*,bonus=False,collected=0,remaining_cap=CAP,rng=None,config=CONFIG,forced_board=None):
    rng=rng or secrets.SystemRandom().random
    family=weighted(rng,config['bonusFamilyWeights'] if bonus else config['familyWeights'])
    weights=list(config['weights']);weights[family]*=config['familyBoost']
    def money(high=False):
        return config['fishValues'][weighted(rng,config['fishWeights'])] if not high else [10,15,20,25,50,2000][weighted(rng,config['dynamiteWeights'])]
    def fresh():
        s=weighted(rng,weights)
        return {'s':s,'v':money()} if s==9 else {'s':s}
    board=[fresh() for _ in range(15)] if forced_board is None else [dict(c) for c in forced_board]
    if forced_board is None:
        positions=list(range(15))
        # Random sampling without replacement keeps all features in distinct cells.
        def inject(n,symbol):
            for i in range(n):
                j=int(rng()*len(positions));index=positions.pop(j);board[index]={'s':symbol}
        if bonus:inject(weighted(rng,config['wildCounts']),11)
        else:inject(weighted(rng,config['scatters']),10)
    initial=[dict(c) for c in board]
    line_pay,line_wins=evaluate(initial)
    scatters=sum(c['s']==10 for c in initial)
    awarded=10 if scatters==3 else 15 if scatters==4 else 20 if scatters>=5 else 0
    wilds=[i for i,c in enumerate(board) if c['s']==11] if bonus else []
    dynamite=[]
    if bonus and wilds and not any(c['s']==9 for c in board) and rng()<config['dynamiteChance']:
        positions=[i for i,c in enumerate(board) if c['s'] not in (10,11)]
        n=min(len(positions),1+weighted(rng,config['dynamiteCounts']))
        for _ in range(n):
            index=positions.pop(int(rng()*len(positions)));board[index]={'s':9,'v':money(True)};dynamite.append(index)
    fish=[{'index':i,'value':c['v']} for i,c in enumerate(board) if c['s']==9]
    # This spin uses its opening stage. New stage is applied on the next free spin.
    opening_level=min(3,collected//4)
    multiplier=LEVELS[opening_level] if bonus else 1
    fish_sum=sum(c['value'] for c in fish)
    collection=fish_sum*len(wilds)*multiplier*100 if bonus else 0
    new_collected=min(12,collected+len(wilds)) if bonus else 0
    thresholds=[t for t in (4,8,12) if collected<t<=new_collected]
    extra=10*len(thresholds)
    uncapped=line_pay+collection
    payout=min(remaining_cap,uncapped)
    return {'initialBoard':initial,'board':board,'lineWins':line_wins,'lineHundredths':line_pay,'collectionHundredths':collection,'payoutHundredths':payout,'fish':fish,'fishSum':fish_sum,'fishermen':wilds,'dynamite':dynamite,'multiplier':multiplier,'nextMultiplier':LEVELS[min(3,new_collected//4)],'collectedBefore':collected,'collected':new_collected,'thresholds':thresholds,'extraSpins':extra,'scatters':scatters,'bonusSpins':awarded if not bonus else 0,'capped':uncapped>=remaining_cap}
