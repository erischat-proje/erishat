"""Original Lidya cluster/scatter engines. Integer hundredths; server-only randomness.
Model v1 is not RTP calibrated. Keep v1 available for persisted bonuses.
"""
import secrets

VERSION = 'lidya-aztek-ares-v1'
CAP = 1000000  # hundredths of stake: 10,000x, shared by whole bonus round
FEATURES = ['Nükleer', 'Vahşi Taş', 'Kareler', 'Dev Taş', 'Şanslı Wild']
AZ_LIMITS = [114, 116, 120, 125, 132]
AZ_BASE = [10, 10, 10, 50, 50, 75, 100]
AZ_TOP = [5000, 7000, 10000, 15000, 30000, 67500, 100000]
ARES_BASE = [25, 30, 40, 50, 100, 150, 200, 300, 400]
ARES_TOP = [100, 120, 160, 200, 300, 500, 800, 1200, 2000]
BASE_LOCKS = [(20,[2,3,4]), (50,[5,7,8]), (100,[10,15,25,50])]
FREE_LOCKS = [(15,[2,5,10,25,50]), (30,[10,25,50,100]), (45,[20,50,100,150]), (60,[30,50,100,200]), (100,[50,100,150,250]), (225,[500])]

def pick(n): return secrets.randbelow(n)
def symbol(az, scatter=True):
    if az: return pick(7)
    r=pick(10000)
    if scatter and r<100: return 9
    if r<300: return 10+pick(4)
    return pick(9)

def neighbors(i,c,r):
    x,y=i%c,i//c
    return [v for v in (i-1 if x else -1,i+1 if x<c-1 else -1,i-c if y else -1,i+c if y<r-1 else -1) if v>=0]

def groups(board,az):
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
                for v in neighbors(u,8,8):
                    if v not in seen and v not in used and board[v] in (t,7):
                        seen.add(v);stack.append(v)
            if len(part)>=5 and any(board[k]==t for k in part):
                result.append((t,part));used.update(part)
    return result

def pays(t,n,az):
    if not az: return ARES_TOP[t] if n>=12 else ARES_BASE[t]*(2 if n>=10 else 1)
    if n>=25:return AZ_TOP[t]
    return AZ_BASE[t]*(100 if n>=20 else 30 if n>=15 else 8 if n>=10 else 3 if n>=8 else 1)

class Turn:
    def __init__(self,kind,bonus=False,remaining_cap=CAP):
        self.az=kind=='aztek';self.c=8 if self.az else 6;self.r=8 if self.az else 5
        self.board=[symbol(self.az) for _ in range(self.c*self.r)]
        self.events=[];self.marks={};self.pending=set();self.fired=set()
        self.count=0;self.stage_count=0;self.stage=-1;self.mult=1;self.locks=[]
        self.bonus=bonus;self.win=0;self.limit=remaining_cap;self.scatters=0
    def event(self,kind,**kw):
        self.events.append(dict(kind=kind,board=self.board[:],count=self.count,mult=self.mult,stage=self.stage,stage_count=self.stage_count,win=self.win,locks=self.locks[:],marks=[[i,f] for i,f in sorted(self.marks.items())],**kw))
    def add(self,value): self.win=min(self.limit,self.win+value)
    def capped(self):return self.win>=self.limit
    def unlock(self):
        if self.az:return
        for n,options in (FREE_LOCKS if self.bonus else BASE_LOCKS):
            if self.count>=n and len(self.locks)<(FREE_LOCKS if self.bonus else BASE_LOCKS).index((n,options))+1:
                v=options[pick(len(options))];self.locks.append(v);self.mult=max(self.mult,v)
                self.event('unlock',value=v)
    def clear(self,ids,source='win'):
        ids=sorted(set(ids));self.count+=len(ids)
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
                self.board[y*self.c+x]=remain[k] if k<len(remain) else symbol(self.az,scatter=False)
        self.event('drop',cells=ids)
    def cascades(self):
        while not self.capped():
            gs=groups(self.board,self.az)
            if not gs:break
            ids=[];payments=[]
            for t,cells in gs:
                value=pays(t,len(cells),self.az)*(self.mult if self.az else 1)
                self.add(value);ids.extend(cells);payments.append(dict(symbol=t,count=len(cells),pay=value))
            self.event('pay',payments=payments)
            self.clear(ids)
    def feature(self,f):
        self.event('feature',feature=f,name=FEATURES[f]);self.fired.add(f)
        if f==0:self.clear(range(64),'nuclear');return
        if f==1:
            t=pick(7);self.board=[7 if v==t else v for v in self.board]
        elif f==2:
            for _ in range(3):
                x,y,t=pick(7),pick(7),pick(7)
                for dy in range(2):
                    for dx in range(2):self.board[(y+dy)*8+x+dx]=t
        elif f==3:
            size=3+pick(3);x,y,t=pick(9-size),pick(9-size),pick(7)
            for dy in range(size):
                for dx in range(size):self.board[(y+dy)*8+x+dx]=t
            self.event('colossal',x=x,y=y,size=size,symbol=t)
        else:
            cells=list(range(64))
            for _ in range(5+pick(11)):
                i=cells.pop(pick(len(cells)));self.board[i]=7
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

def spin(kind,bonus=False,purchase=False,remaining_cap=CAP,version=VERSION):
    if version!=VERSION:raise ValueError('Unsupported persisted game model')
    turn=Turn(kind,bonus,remaining_cap)
    awarded=0
    if kind=='aztek':
        if not purchase:
            cells=list(range(64))
            for f in range(5):turn.marks[cells.pop(pick(len(cells)))]=f
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
    return dict(events=turn.events,board=turn.board,payoutHundredths=turn.win,awarded=awarded,capped=turn.capped(),count=turn.count,multiplier=turn.mult,version=VERSION)

def rules(kind):
    az=kind=='aztek'
    return dict(name='Lidya Aztek Hazinesi' if az else 'Lidya Savaşın Kılıcı',version=VERSION,bonus_cost=100,bonus_spins=None if az else 15,max_win=10000,rtp_status='Kalibre edilmemiş özgün model',symbol_names=['Mavi','Pembe','Turuncu','Yeşil','Mor','Kırmızı','Yakut'] if az else ['Mavi','Yeşil','Turkuaz','Pembe','Kırmızı','Kalkan','İksir','Miğfer','Savaş Arabası'],pay_sizes=[5,8,10,15,20,25] if az else [8,10,12],paytable=[[pays(t,n,az)/100 for n in ([5,8,10,15,20,25] if az else [8,10,12])] for t in range(7 if az else 9)],base_locks=BASE_LOCKS,free_locks=FREE_LOCKS,gold_thresholds=AZ_LIMITS)
