"""Lidya Hasan v3: five fixed circular reel strips, 10 audited paylines."""
import json,secrets
from pathlib import Path
CONFIG=json.loads(Path(__file__).with_name('balikci-math.json').read_text())
KEYS=['ten','jack','queen','king','ace','tackle','fly','rod','float','fish','scatter','fisherman']
LINES=[[1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],[0,1,2,1,0],[2,1,0,1,2],[0,0,1,2,2],[2,2,1,0,0],[1,0,0,0,1],[1,2,2,2,1],[0,1,1,1,0]]
PAY=CONFIG['paytable'];CAP=210000;LEVELS=[1,2,3,10]

def weighted(rng,weights):
    p=rng()*sum(weights)
    for i,w in enumerate(weights):
        p-=w
        if p<0:return i
    return len(weights)-1

def evaluate(board,paytable=PAY):
    wins=[]
    for i,line in enumerate(LINES):
        indices=[line[col]*5+col for col in range(5)]
        first=board[indices[0]]['s']
        if first==10:continue
        candidates=range(10) if first==11 else (first,)
        best=None
        for symbol in candidates:
            count=0
            for index in indices:
                if board[index]['s'] in (symbol,11):count+=1
                else:break
            if count>=3:
                pay=paytable[symbol][count-3]
                if best is None or pay>best['payHundredths']:
                    best={'line':i+1,'symbol':KEYS[symbol],'count':count,'indices':indices[:count],'payHundredths':pay}
        if best:wins.append(best)
    return sum(w['payHundredths'] for w in wins),wins

def spin(*,bonus=False,collected=0,remaining_cap=CAP,rng=None,config=CONFIG,forced_board=None,model_version=None,trace=True):
    if model_version=='lidya-balikci-v1':
        from .balikci_engine_v1 import spin as legacy
        return legacy(bonus=bonus,collected=collected,remaining_cap=remaining_cap,rng=rng,forced_board=forced_board)
    if model_version not in (None,CONFIG['version']):raise ValueError('Unsupported stored bonus model version')
    rng=rng or secrets.SystemRandom().random
    def money(high=False):
        value=config['fishValues'][weighted(rng,config['fishWeights'])] if not high else [10,15,20,25,50,2000][weighted(rng,config['dynamiteWeights'])]
        return round(value*config.get('naturalRewardFactor',1),2)
    def cell(s):return {'s':s,'v':money()} if s==9 else {'s':s}
    reels=config['bonusReels'] if bonus else config['baseReels'];stops=[int(rng()*len(reel)) for reel in reels]
    board=[None]*15
    for col,reel in enumerate(reels):
        for row in range(3):board[row*5+col]=cell(reel[(stops[col]+row)%len(reel)])
    if forced_board is not None:board=[dict(c) for c in forced_board]
    else:
        count=weighted(rng,config['wildCounts'] if bonus else config['scatters']);columns=list(range(5))
        for _ in range(count):
            col=columns.pop(int(rng()*len(columns)));row=int(rng()*3);board[row*5+col]={'s':11 if bonus else 10}
    initial=[dict(c) for c in board];line_pay,line_wins=evaluate(initial,config['paytable'])
    scatters=sum(c['s']==10 for c in initial);awarded=10 if scatters==3 else 15 if scatters==4 else 20 if scatters>=5 else 0
    wilds=[i for i,c in enumerate(board) if c['s']==11] if bonus else [];dynamite=[]
    if bonus and wilds and not any(c['s']==9 for c in board) and rng()<config['dynamiteChance']:
        positions=[i for i,c in enumerate(board) if c['s'] not in (10,11)];n=min(len(positions),1+weighted(rng,config['dynamiteCounts']))
        for _ in range(n):
            index=positions.pop(int(rng()*len(positions)));board[index]={'s':9,'v':money(True)};dynamite.append(index)
    fish=[{'index':i,'value':c['v']} for i,c in enumerate(board) if c['s']==9];opening_level=min(3,collected//4);multiplier=LEVELS[opening_level] if bonus else 1
    fish_sum=sum(c['value'] for c in fish);collection=round(fish_sum*len(wilds)*multiplier*100) if bonus else 0;new_collected=min(12,collected+len(wilds)) if bonus else 0
    thresholds=[t for t in (4,8,12) if collected<t<=new_collected];uncapped=line_pay+collection;payout=min(remaining_cap,uncapped)
    windows=[]
    if trace:
        for col,reel in enumerate(reels):
            window=[{'s':reel[(stops[col]-12+k)%len(reel)],'v':2} for k in range(12)]
            window.extend(dict(initial[row*5+col]) for row in range(3));windows.append(window)
    return {'initialBoard':initial,'board':board,'lineWins':line_wins,'lineHundredths':line_pay,'collectionHundredths':collection,'payoutHundredths':payout,'fish':fish,'fishSum':fish_sum,'fishermen':wilds,'dynamite':dynamite,'multiplier':multiplier,'nextMultiplier':LEVELS[min(3,new_collected//4)],'collectedBefore':collected,'collected':new_collected,'thresholds':thresholds,'extraSpins':10*len(thresholds),'scatters':scatters,'bonusSpins':awarded if not bonus else 0,'capped':uncapped>=remaining_cap,'reelStops':stops,'reelWindows':windows,'modelVersion':config['version'],'symbolRoles':config['symbolRoles']}
