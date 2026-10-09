"""Server-owned 101 Okey. Tile IDs are physical, meld faces explicit."""
from __future__ import annotations
import copy
import secrets
import time

STAKES = (50,100,150,200,250,300)
TURN_SECONDS = 45

def event(s, kind, **data):
    s['version'] += 1
    s['events'].append(dict(seq=s['version'],kind=kind,**data))
    s['events'] = s['events'][-64:]

def player(s, seat):
    return next(p for p in s['players'] if p['seat']==seat)

def face(s, tile):
    if not isinstance(tile,int) or not 0<=tile<106: raise ValueError('Geçersiz taş.')
    if tile>=104: return tuple(s['joker'])
    return tile//26, tile%13+1

def wild(s,tile):
    return tile<104 and face(s,tile)==tuple(s['joker'])

def next_turn(s):
    s['turn']=s['turn']%4+1
    s.update(phase='draw',taken=None,deadline=time.time()+TURN_SECONDS)

def deal(s):
    deck=list(range(106));secrets.SystemRandom().shuffle(deck)
    i=next(i for i,t in enumerate(deck) if t<104)
    s['indicator']=deck.pop(i)
    c,n=s['indicator']//26,s['indicator']%13+1
    s['joker']=[c,n%13+1]
    starter=(s['hand_number']-1)%4+1
    for p in s['players']:
        p.update(hand=[deck.pop() for _ in range(22 if p['seat']==starter else 21)],opened=None)
    s.update(stock=deck,discards={str(n):[] for n in range(1,5)},melds=[],turn=starter,
             phase='discard',taken=None,threshold=101,pair_threshold=5,
             deadline=time.time()+TURN_SECONDS,status='playing',round_scores=None)
    event(s,'deal',hand_number=s['hand_number'])

def begin(s):
    if sorted(p['seat'] for p in s['players'])!=[1,2,3,4]:raise ValueError('101 Okey dört hazır oyuncu gerektirir.')
    for p in s['players']:p['score']=0
    s['hand_number']=1;s['history']=[]
    deal(s)

def check_turn(s,seat,phase='discard'):
    if s['status']!='playing' or s['turn']!=seat or s['phase']!=phase:raise ValueError('Bu hamlenin sırası değil.')

def draw(s,seat,source):
    check_turn(s,seat,'draw')
    p=player(s,seat)
    if source=='discard':
        pile=s['discards'][str((seat-2)%4+1)]
        if not pile:raise ValueError('Solda alınacak taş yok.')
        tile=pile.pop();s['taken']=tile
    elif source=='stock':
        if not s['stock']:raise ValueError('Kapalı taş kalmadı.')
        tile=s['stock'].pop();s['taken']=None
    else:raise ValueError('Taş kaynağı geçersiz.')
    p['hand'].append(tile);s['phase']='discard'
    event(s,'draw',seat=seat,source=source)

def meld(s, tiles, kind, faces=None):
    if len(set(tiles))!=len(tiles):raise ValueError('Bir taş iki kez kullanılamaz.')
    if kind not in ('run','set','pair'):raise ValueError('Per türü geçersiz.')
    if not faces or len(faces)!=len(tiles):raise ValueError('Per taşlarının renk ve sayıları gerekli.')
    ff=[]
    for t,f in zip(tiles,faces):
        if len(f)!=2 or not all(type(x)==int for x in f) or not 0<=f[0]<4 or not 1<=f[1]<=13:raise ValueError('Per değeri geçersiz.')
        if not wild(s,t) and face(s,t)!=tuple(f):raise ValueError('Taş bu değeri temsil etmiyor.')
        ff.append(tuple(f))
    if kind=='pair':
        valid=len(tiles)==2 and ff[0]==ff[1]
    elif kind=='set':
        valid=3<=len(tiles)<=4 and len({f[1] for f in ff})==1 and len({f[0] for f in ff})==len(ff)
    else:
        valid=3<=len(tiles)<=13 and len({f[0] for f in ff})==1 and [f[1] for f in ff]==list(range(ff[0][1],ff[0][1]+len(ff)))
    if not valid:raise ValueError('Geçerli seri, grup veya çift oluşturun. 13’ten 1’e dönülmez.')
    return dict(tiles=list(tiles),faces=[list(f) for f in ff],kind=kind)

def open_melds(s,seat,groups):
    check_turn(s,seat);p=player(s,seat)
    if not groups or len(groups)>14:raise ValueError('Açılacak perleri seçin.')
    parsed=[meld(s,g['tiles'],g['kind'],g.get('faces')) for g in groups]
    ids=[t for g in parsed for t in g['tiles']]
    if len(set(ids))!=len(ids) or not set(ids)<=set(p['hand']):raise ValueError('Perler elinizdeki farklı taşlardan oluşmalı.')
    if len(ids)>=len(p['hand']):raise ValueError('Bitirmek için elde atılacak bir taş kalmalı.')
    pairs=all(g['kind']=='pair' for g in parsed)
    series=all(g['kind']!='pair' for g in parsed)
    if not pairs and not series:raise ValueError('Seri ve çift ayrı açılır.')
    if not p['opened']:
        value=len(parsed) if pairs else sum(f[1] for g in parsed for f in g['faces'])
        limit=s['pair_threshold'] if pairs else s['threshold']
        if value<limit:raise ValueError(f'Açmak için en az {limit} '+('çift' if pairs else 'puan')+' gerekli.')
        p['opened']='pair' if pairs else 'series'
        if s['progressive']:s['pair_threshold' if pairs else 'threshold']=value+1
    elif p['opened']=='pair' and not pairs:raise ValueError('Çift açan oyuncu yeni seri açamaz.')
    elif p['opened']=='series' and pairs and not any(q['opened']=='pair' for q in s['players']):raise ValueError('Çift açan oyuncu olmadan çift işlenemez.')
    for g in parsed:g.update(owner=seat,id=secrets.token_hex(6));s['melds'].append(g)
    p['hand']=[t for t in p['hand'] if t not in ids]
    event(s,'open',seat=seat)

def lay(s,seat,tile,mid,end,as_face=None):
    check_turn(s,seat);p=player(s,seat)
    if not p['opened']:raise ValueError('Taş işlemeden önce açılmalısınız.')
    if tile not in p['hand'] or len(p['hand'])<2:raise ValueError('İşlenecek taş ve son atış taşı gerekli.')
    g=next((g for g in s['melds'] if g['id']==mid),None)
    if not g or g['kind']=='pair':raise ValueError('Bu pere taş işlenemez.')
    f=as_face or list(face(s,tile))
    ts=list(g['tiles']);fs=list(g['faces'])
    if end=='left':ts.insert(0,tile);fs.insert(0,f)
    else:ts.append(tile);fs.append(f)
    checked=meld(s,ts,g['kind'],fs)
    g.update(checked);p['hand'].remove(tile);event(s,'lay',seat=seat)

def replace(s,seat,tile,mid,index):
    check_turn(s,seat);p=player(s,seat)
    g=next((g for g in s['melds'] if g['id']==mid),None)
    if not p['opened'] or tile not in p['hand'] or not g or not 0<=index<len(g['tiles']):raise ValueError('Okey değiştirme geçersiz.')
    old=g['tiles'][index]
    if not wild(s,old) or wild(s,tile) or face(s,tile)!=tuple(g['faces'][index]):raise ValueError('Okey yerine temsil ettiği taş koyulmalı.')
    if g['kind']=='set' and len(g['tiles'])<4:raise ValueError('Grup okeyi yalnızca dört renk tamamlanınca alınabilir.')
    g['tiles'][index]=tile;p['hand'].remove(tile);p['hand'].append(old);event(s,'replace',seat=seat)

def finish_hand(s,winner=None,okey_finish=False,direct=False):
    scores={}
    for p in s['players']:
        if p['seat']==winner:score=-202 if okey_finish else -101
        elif winner and s['mode']=='paired' and (p['seat']-winner)%2==0:score=0
        else:
            score=202 if not p['opened'] else sum( face(s,t)[1] for t in p['hand'])
            if p['opened']=='pair':score*=2
            if any(wild(s,t) for t in p['hand']):score+=101
            if direct:score=404
            if okey_finish:score*=2
        scores[str(p['seat'])]=score;p['score']+=score
    s['history'].append(dict(hand=s['hand_number'],winner=winner,scores=scores))
    s['round_scores']=scores
    if s['hand_number']>=s['hand_count']:
        if s['mode']=='paired':
            a=sum(p['score'] for p in s['players'] if p['seat']%2);b=sum(p['score'] for p in s['players'] if not p['seat']%2)
            winners=[p['seat'] for p in s['players'] if a==b or (p['seat']%2==1)==(a<b)]
        else:
            best=min(p['score'] for p in s['players']);winners=[p['seat'] for p in s['players'] if p['score']==best]
        s.update(status='finished',winners=winners);event(s,'win',winners=winners)
    else:s.update(status='hand_finished',next_hand_at=time.time()+8);event(s,'hand_finished',winner=winner)

def discard(s,seat,tile):
    check_turn(s,seat);p=player(s,seat)
    if tile not in p['hand']:raise ValueError('Atılacak taş elinizde değil.')
    if s.get('taken') in p['hand']:raise ValueError('Soldan alınan taşı açmalı veya masaya işlemelisiniz.')
    p['hand'].remove(tile);s['discards'][str(seat)].append(tile);event(s,'discard',seat=seat,tile=tile)
    if not p['hand']:
        direct=not any(q['opened'] for q in s['players'] if q['seat']!=seat)
        finish_hand(s,seat,wild(s,tile),direct)
    elif not s['stock']:finish_hand(s)
    else:next_turn(s)

def advance(s):
    if s['status']!='hand_finished':raise ValueError('El henüz bitmedi.')
    s['hand_number']+=1;deal(s)

def public(s,uid):
    out=copy.deepcopy(s);out['stock_count']=len(out.pop('stock',[]));out.pop('taken',None)
    for p in out['players']:
        hand=p.pop('hand',[]);p['hand_count']=len(hand)
        if p['user_id']==uid:p['hand']=hand
    return out

def candidate_groups(s,hand,pairs=False):
    # Suggestions use only the player's own hand; wild substitutions remain explicit in manual editor.
    pool={}
    for t in hand:
        if not wild(s,t):pool.setdefault(face(s,t),[]).append(t)
    out=[]
    if pairs:
        for f,ids in pool.items():
            if len(ids)==2:out.append(dict(kind='pair',tiles=ids,faces=[list(f),list(f)]))
        return out
    for c in range(4):
        start=1
        while start<=13:
            run=[]
            while start<=13 and pool.get((c,start)):run.append(pool[(c,start)][0]);start+=1
            if len(run)>=3:
                out.append(dict(kind='run',tiles=run,faces=[list(face(s,t)) for t in run]))
                for t in run:pool[face(s,t)].remove(t)
            start+=1
    for n in range(1,14):
        ids=[pool[(c,n)][0] for c in range(4) if pool.get((c,n))]
        if len(ids)>=3:out.append(dict(kind='set',tiles=ids,faces=[list(face(s,t)) for t in ids]))
    return out

def bot_step(s,now):
    if s['status']=='hand_finished':advance(s);return
    seat=s['turn'];p=player(s,seat)
    if s['phase']=='draw':draw(s,seat,'stock')
    groups=candidate_groups(s,p['hand'],p['opened']=='pair')
    if groups:
        trial=copy.deepcopy(s)
        try:open_melds(trial,seat,groups)
        except ValueError:pass
        else:s.clear();s.update(trial);p=player(s,seat)
    tile=max(p['hand'],key=lambda t:(not wild(s,t),face(s,t)[1]))
    discard(s,seat,tile)

def invariant(s):
    ids=[s['indicator'],*s['stock']]
    ids += [t for p in s['players'] for t in p['hand']]
    ids += [t for g in s['melds'] for t in g['tiles']]
    ids += [t for pile in s['discards'].values() for t in pile]
    assert sorted(ids)==list(range(106)), 'Physical tile conservation failed'
