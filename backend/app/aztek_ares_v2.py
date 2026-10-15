"""Original Lidya cluster/scatter engines. Integer hundredths; server-only randomness.
Model v2 uses paid-symbol counters and fixed, published probabilities.
"""
import secrets
import json
from pathlib import Path
CONFIG = json.loads(Path(__file__).with_name('aztek-ares-math-v2.json').read_text())

VERSION = 'lidya-aztek-ares-v2'
CAP = 1000000  # hundredths of stake: 10,000x, shared by whole bonus round
FEATURES = ['Nükleer', 'Vahşi Taş', 'Kareler', 'Dev Taş', 'Şanslı Wild']
AZ_LIMITS = [114, 116, 120, 125, 132]
BASE_LOCKS = [(20,[2,3,4]), (50,[5,7,8]), (100,[10,15,25,50])]
FREE_LOCKS = [(15,[2,5,10,25,50]), (30,[10,25,50,100]), (45,[20,50,100,150]), (60,[30,50,100,200]), (100,[50,100,150,250]), (225,[500])]

def neighbors(i,c,r):
    x,y=i%c,i//c
    return [v for v in (i-1 if x else -1,i+1 if x<c-1 else -1,i-c if y else -1,i+c if y<r-1 else -1) if v>=0]

NEIGHBORS = [neighbors(i,8,8) for i in range(64)]

def groups(board,az):
    if az and 7 not in board:
        seen=set();result=[]
        for start,t in enumerate(board):
            if start in seen:continue
            stack=[start];seen.add(start);part=[]
            while stack:
                u=stack.pop();part.append(u)
                for v in NEIGHBORS[u]:
                    if v not in seen and board[v]==t:
                        seen.add(v);stack.append(v)
            if len(part)>=5:result.append((t,part))
        return result
    if not az:
        return [(t,[i for i,v in enumerate(board) if v==t]) for t in range(9) if board.count(t)>=8]
    # A Wild participates in exactly one paid cluster per wave. Re-flood after
    # assigning higher-valued candidates so disconnected remnants never pay.
    used=set(); result=[]
    for t in reversed(range(7)):
        seen=set()
        for i,v in enumerate(board):
            if i in used or i in seen or v not in (t,7): continue
            stack=[i]; seen.add(i); part=[]
            while stack:
                u=stack.pop();part.append(u)
                for v in NEIGHBORS[u]:
                    if v not in seen and v not in used and board[v] in (t,7):
                        seen.add(v);stack.append(v)
            if len(part)>=5 and any(board[k]==t for k in part):
                result.append((t,part));used.update(part)
    return result

class Turn:
    def __init__(self,kind,bonus=False,remaining_cap=CAP,*,rng=None,trace=True,config=CONFIG):
        self.rng=rng or secrets.SystemRandom().random;self.trace=trace;self.config=config
        self.az=kind=='aztek';self.c=8 if self.az else 6;self.r=8 if self.az else 5
        self.bonus=bonus
        self.board=[self.symbol() for _ in range(self.c*self.r)]
        self.events=[];self.marks={};self.pending=set();self.fired=set()
        self.count=0;self.stage_count=0;self.stage=-1;self.mult=1;self.locks=[]
        self.win=0;self.limit=remaining_cap;self.scatters=0
    def pick(self,n):
        return min(n-1,int(self.rng()*n))
    def symbol(self,scatter=True):
        if self.az:return self.pick(7)
        r=self.pick(10000)
        if scatter and r<100:return 9
        if r<300:return 10+self.pick(4)
        weights=self.config['aresBonusWeights' if self.bonus else 'aresWeights']
        p=self.rng()*sum(weights)
        for i,w in enumerate(weights):
            p-=w
            if p<0:return i
        return len(weights)-1
    def event(self,kind,**kw):
        if not self.trace:return
        self.events.append(dict(kind=kind,board=self.board[:],count=self.count,mult=self.mult,stage=self.stage,stage_count=self.stage_count,win=self.win,locks=self.locks[:],marks=[[i,f] for i,f in sorted(self.marks.items())],**kw))
    def add(self,value): self.win=min(self.limit,self.win+value)
    def capped(self):return self.win>=self.limit
    def unlock(self):
        if self.az:return
        for n,options in (FREE_LOCKS if self.bonus else BASE_LOCKS):
            if self.count>=n and len(self.locks)<(FREE_LOCKS if self.bonus else BASE_LOCKS).index((n,options))+1:
                v=options[self.pick(len(options))];self.locks.append(v);self.mult=max(self.mult,v)
                self.event('unlock',value=v)
    def clear(self,ids,source='win'):
        ids=sorted(set(ids))
        # Aztek progression counts only symbols that actually paid. Nuclear
        # refreshes cannot pay for the next Gold Fever stage themselves.
        if not self.az or source=='win':
            self.count+=len(ids)
            if self.stage>=0:self.stage_count+=len(ids)
        for i in ids:
            if i in self.marks:
                f=self.marks.pop(i)
                if f not in self.fired:self.pending.add(f)
        self.event('clear',cells=ids,source=source);self.unlock()
        cells=set(ids)
        for x in range(self.c):
            remain=[self.board[y*self.c+x] for y in range(self.r-1,-1,-1) if y*self.c+x not in cells]
            for k,y in enumerate(range(self.r-1,-1,-1)):
                self.board[y*self.c+x]=remain[k] if k<len(remain) else self.symbol(scatter=False)
        self.event('drop',cells=ids)
    def cascades(self):
        while not self.capped():
            gs=groups(self.board,self.az)
            if not gs:break
            ids=[];payments=[]
            for t,cells in gs:
                table=self.config['aztekPaytable'] if self.az else self.config['aresBonusPaytable' if self.bonus else 'aresPaytable']
                sizes=[5,8,10,15,20,25] if self.az else [8,10,12]
                bucket=sum(len(cells)>=n for n in sizes)-1
                value=table[t][bucket]*(self.mult if self.az else 1)
                self.add(value);ids.extend(cells);
                if self.trace:payments.append(dict(symbol=t,count=len(cells),pay=value))
            self.event('pay',payments=payments)
            self.clear(ids)
    def feature(self,f):
        self.event('feature',feature=f,name=FEATURES[f]);self.fired.add(f)
        if f==0:self.clear(range(64),'nuclear');return
        if f==1:
            t=self.pick(7);self.board=[7 if v==t else v for v in self.board]
        elif f==2:
            for _ in range(3):
                x,y,t=self.pick(7),self.pick(7),self.pick(7)
                for dy in range(2):
                    for dx in range(2):self.board[(y+dy)*8+x+dx]=t
        elif f==3:
            size=3+self.pick(3);x,y,t=self.pick(9-size),self.pick(9-size),self.pick(7)
            for dy in range(size):
                for dx in range(size):self.board[(y+dy)*8+x+dx]=t
            self.event('colossal',x=x,y=y,size=size,symbol=t)
        else:
            cells=list(range(64))
            for _ in range(5+self.pick(11)):
                i=cells.pop(self.pick(len(cells)));self.board[i]=7
        self.event('transform',feature=f)
    def gold(self):
        self.marks.clear();self.pending.clear()
        for stage in range(5):
            if self.capped():break
            self.stage=stage;self.stage_count=0;self.mult=2*(stage+1);self.event('stage')
            for f in range(5):
                if self.capped():break
                self.feature(f);self.cascades()
            if stage==4 or self.stage_count<AZ_LIMITS[stage+1]:break
    def bombs(self):
        queue=[i for i,v in enumerate(self.board) if v>=10]
        if not queue:return False
        done=set();ids=set(queue)
        while queue:
            i=queue.pop()
            if i in done:continue
            done.add(i);x,y=i%6,i//6;direction=self.board[i]-10
            for j,v in enumerate(self.board):
                xx,yy=j%6,j//6
                if (direction==0 and y==yy) or (direction==1 and x==xx) or (direction==2 and abs(x-xx)==abs(y-yy)) or (direction==3 and (x==xx or y==yy)):
                    ids.add(j)
                    if v>=10 and j not in done:queue.append(j)
        self.event('bomb',cells=sorted(ids));self.clear(ids,'bomb');return True

def spin(kind,bonus=False,purchase=False,remaining_cap=CAP,version=VERSION,*,rng=None,trace=True,config=CONFIG):
    if version!=VERSION:raise ValueError('Unsupported persisted game model')
    turn=Turn(kind,bonus,remaining_cap,rng=rng,trace=trace,config=config)
    awarded=0
    if kind=='aztek':
        if not purchase:
            cells=list(range(64))
            for f in range(5):
                if turn.rng()<config['aztekMarkChance']:
                    turn.marks[cells.pop(turn.pick(len(cells)))]=f
        turn.event('initial')
        if purchase:turn.gold()
        else:
            turn.cascades()
            while turn.pending and not turn.capped():
                f=min(turn.pending);turn.pending.remove(f);turn.feature(f);turn.cascades()
            if turn.count>=114 and not turn.capped():turn.gold()
    elif purchase:
        awarded=15;turn.event('purchase',awarded=15)
    else:
        turn.scatters=turn.board.count(9);turn.event('initial')
        if turn.scatters>=4:
            turn.add(300 if turn.scatters==4 else 500 if turn.scatters==5 else 10000)
            awarded=15;turn.event('scatter',scatters=turn.scatters,awarded=awarded)
        turn.cascades()
        while not turn.capped() and turn.bombs():turn.cascades()
        turn.win=min(turn.limit,turn.win*turn.mult)
    turn.event('result',capped=turn.capped())
    return dict(events=turn.events,board=turn.board,payoutHundredths=turn.win,awarded=awarded,capped=turn.capped(),count=turn.count,multiplier=turn.mult,version=VERSION,goldFever=turn.stage>=0)

def rules(kind):
    az=kind=='aztek'
    return dict(name='Lidya Aztek Hazinesi' if az else 'Lidya Savaşın Kılıcı',version=VERSION,bonus_cost=100,bonus_spins=None if az else 15,max_win=10000,target_rtp=CONFIG['targetRtp'],rtp_status='Monte Carlo tahmini; sertifikalı RTP değildir',symbol_names=['Mavi','Pembe','Turuncu','Yeşil','Mor','Kırmızı','Yakut'] if az else ['Mavi','Yeşil','Turkuaz','Pembe','Kırmızı','Kalkan','İksir','Miğfer','Savaş Arabası'],pay_sizes=[5,8,10,15,20,25] if az else [8,10,12],paytable=[[v/100 for v in row] for row in CONFIG['aztekPaytable' if az else 'aresPaytable']],bonus_paytable=None if az else [[v/100 for v in row] for row in CONFIG['aresBonusPaytable']],mark_chance=CONFIG['aztekMarkChance'] if az else None,base_locks=BASE_LOCKS,free_locks=FREE_LOCKS,gold_thresholds=AZ_LIMITS)
