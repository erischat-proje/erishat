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
    s.update(phase='draw',taken=None,deadline=time.time()+TURN_SECONDS,
             turn_seq=s.get('turn_seq',0)+1,pair_laid=0)

def deal(s):
    deck=list(range(106));secrets.SystemRandom().shuffle(deck)
    i=next(i for i,t in enumerate(deck) if t<104)
    s['indicator']=deck.pop(i)
    c,n=s['indicator']//26,s['indicator']%13+1
    s['joker']=[c,n%13+1]
    starter=(s['hand_number']-1)%4+1
    for p in s['players']:
        p.update(hand=[deck.pop() for _ in range(22 if p['seat']==starter else 21)],opened=None,
                 opened_turn=None,penalty_points=0,opening_points=0)
    s.update(stock=deck,discards={str(n):[] for n in range(1,5)},melds=[],turn=starter,
             phase='discard',taken=None,threshold=101,pair_threshold=5,
             deadline=time.time()+TURN_SECONDS,status='playing',round_scores=None,
             turn_seq=0,pair_laid=0,penalty_log=[],score_breakdown=None)
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
        tile=pile[-1]
        if wild(s,tile):raise ValueError('Yana atılan gerçek okey alınamaz.')
        if p['opened'] and not tile_options(s,seat,tile):raise ValueError('Soldaki taş masaya işlenemiyor.')
        tile=pile.pop();s['taken']=tile
        s['taken_version']=s['version']+1
    elif source=='stock':
        if not s['stock']:raise ValueError('Kapalı taş kalmadı.')
        tile=s['stock'].pop();s['taken']=None
    else:raise ValueError('Taş kaynağı geçersiz.')
    p['hand'].append(tile);s['phase']='discard'
    event(s,'draw',seat=seat,source=source)

def return_discard(s,seat):
    check_turn(s,seat)
    p=player(s,seat);tile=s.get('taken')
    if tile is None or tile not in p['hand']:raise ValueError('Geri bırakılacak alınmış taş yok.')
    if any(e['seq']>s.get('taken_version',0) and e.get('seat')==seat and e['kind'] in ('open','lay','replace') for e in s['events']):
        raise ValueError('Masaya hamle yaptıktan sonra alınan taş geri bırakılamaz.')
    p['hand'].remove(tile);s['discards'][str((seat-2)%4+1)].append(tile)
    s.update(taken=None,phase='draw')
    penalty(s,seat,'wrong_take',101,tile=tile)
    draw(s,seat,'stock')

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

def open_melds(s,seat,groups,finish_tile=None):
    check_turn(s,seat);p=player(s,seat)
    if not groups or len(groups)>14:raise ValueError('Açılacak perleri seçin.')
    parsed=[meld(s,g['tiles'],g['kind'],g.get('faces')) for g in groups]
    ids=[t for g in parsed for t in g['tiles']]
    if len(set(ids))!=len(ids) or not set(ids)<=set(p['hand']):raise ValueError('Perler elinizdeki farklı taşlardan oluşmalı.')
    if len(ids)>=len(p['hand']):raise ValueError('Bitirmek için elde atılacak bir taş kalmalı.')
    if finish_tile is not None and (len(p['hand'])-len(ids)!=1 or finish_tile not in p['hand'] or finish_tile in ids):
        raise ValueError('Aç ve bitir için tüm perlerden sonra yalnızca son atış taşı kalmalı.')
    pairs=all(g['kind']=='pair' for g in parsed)
    series=all(g['kind']!='pair' for g in parsed)
    if not pairs and not series:raise ValueError('Seri ve çift ayrı açılır.')
    if not p['opened']:
        value=len(parsed) if pairs else sum(f[1] for g in parsed for f in g['faces'])
        limit=s['pair_threshold'] if pairs else s['threshold']
        if value<limit and (finish_tile is None or pairs):raise ValueError(f'Açmak için en az {limit} '+('çift' if pairs else 'puan')+' gerekli.')
        p['opened']='pair' if pairs else 'series'
        p['opened_turn']=s.get('turn_seq',0)
        p['opening_points']=value
        if s['progressive']:s['pair_threshold' if pairs else 'threshold']=max(limit,value+1)
    elif p['opened']=='pair' and not pairs:raise ValueError('Çift açan oyuncu yeni seri açamaz.')
    elif p['opened']=='series' and pairs and not any(q['opened']=='pair' for q in s['players']):raise ValueError('Çift açan oyuncu olmadan çift işlenemez.')
    if (p['opened']=='pair')==pairs and p.get('opened_turn')==s.get('turn_seq',0) and any(g['owner']==seat for g in s['melds']):
        p['opening_points']=p.get('opening_points',0)+(len(parsed) if pairs else sum(f[1] for g in parsed for f in g['faces']))
        if s['progressive']:
            key='pair_threshold' if pairs else 'threshold'
            s[key]=max(s[key],p['opening_points']+1)
    for g in parsed:
        g.update(owner=seat,id=secrets.token_hex(6),tile_owners=[seat]*len(g['tiles']))
        s['melds'].append(g)
    p['hand']=[t for t in p['hand'] if t not in ids]
    # Four doubles openers have no series to finish on: redeal without hand-end penalties.
    if all(q['opened']=='pair' for q in s['players']):
        s.update(status='hand_finished',redeal=True,next_hand_at=time.time()+8,
                 round_scores={str(q['seat']):q.get('penalty_points',0) for q in s['players']})
        s['history'].append(dict(hand=s['hand_number'],winner=None,kind='redeal',scores=s['round_scores']))
        event(s,'redeal',reason='Dört oyuncu çift açtı; aynı el yeniden dağıtılacak.')
    else:event(s,'open',seat=seat,points=p['opening_points'])

def lay(s,seat,tile,mid,end,as_face=None):
    check_turn(s,seat);p=player(s,seat)
    if not p['opened']:raise ValueError('Taş işlemeden önce açılmalısınız.')
    if tile not in p['hand'] or len(p['hand'])<2:raise ValueError('İşlenecek taş ve son atış taşı gerekli.')
    g=next((g for g in s['melds'] if g['id']==mid),None)
    if not g or g['kind']=='pair':raise ValueError('Bu pere taş işlenemez.')
    if p['opened']=='pair' and s.get('pair_laid',0)>=2:raise ValueError('Çift açan oyuncu bir turda en fazla iki taş işler.')
    f=as_face or list(face(s,tile))
    ts=list(g['tiles']);fs=list(g['faces'])
    if end=='left':ts.insert(0,tile);fs.insert(0,f)
    else:ts.append(tile);fs.append(f)
    checked=meld(s,ts,g['kind'],fs)
    owners=g.get('tile_owners',[g['owner']]*len(g['tiles']))[:]
    if end=='left':owners.insert(0,seat)
    else:owners.append(seat)
    g.update(checked,tile_owners=owners);p['hand'].remove(tile)
    if p['opened']=='pair':s['pair_laid']=s.get('pair_laid',0)+1
    elif g['owner']==seat and p.get('opened_turn')==s.get('turn_seq',0):
        p['opening_points']=p.get('opening_points',0)+f[1]
        if s['progressive']:s['threshold']=max(s['threshold'],p['opening_points']+1)
    event(s,'lay',seat=seat,tile=tile,meld_id=mid,end=end)

def replace(s,seat,tile,mid,index):
    check_turn(s,seat);p=player(s,seat)
    g=next((g for g in s['melds'] if g['id']==mid),None)
    if not p['opened'] or tile not in p['hand'] or not g or not 0<=index<len(g['tiles']):raise ValueError('Okey değiştirme geçersiz.')
    old=g['tiles'][index]
    if not wild(s,old) or wild(s,tile) or face(s,tile)!=tuple(g['faces'][index]):raise ValueError('Okey yerine temsil ettiği taş koyulmalı.')
    if g['kind']=='set' and len(g['tiles'])<4:raise ValueError('Grup okeyi yalnızca dört renk tamamlanınca alınabilir.')
    owner=g.get('tile_owners',[g['owner']]*len(g['tiles']))[index]
    g['tiles'][index]=tile
    g.setdefault('tile_owners',[g['owner']]*len(g['tiles']))[index]=seat
    p['hand'].remove(tile);p['hand'].append(old)
    if owner!=seat:penalty(s,owner,'okey_retrieved',101,tile=old)
    event(s,'replace',seat=seat,tile=tile,meld_id=mid,index=index)

def penalty(s,seat,reason,points=101,**extra):
    if not s.get('penalties',False):return
    p=player(s,seat);p['score']+=points;p['penalty_points']=p.get('penalty_points',0)+points
    entry=dict(seat=seat,reason=reason,points=points,**extra)
    s.setdefault('penalty_log',[]).append(entry)
    event(s,'penalty',**entry)

def declare_open(s,seat,groups,finish_tile=None):
    """A declaration is atomic; malformed requests are errors, genuine failed declarations can be penalized."""
    check_turn(s,seat)
    ids=[t for g in groups for t in g.get('tiles',[])]
    if not ids or len(set(ids))!=len(ids) or not set(ids)<=set(player(s,seat)['hand']):
        raise ValueError('Açılacak taşları elinizden seçin.')
    trial=copy.deepcopy(s)
    try:
        open_melds(trial,seat,groups,finish_tile)
        if finish_tile is not None:discard(trial,seat,finish_tile)
    except ValueError as e:
        if not s.get('penalties'):raise
        penalty(s,seat,'wrong_open',101,message=str(e))
        return str(e)
    s.clear();s.update(trial)
    return None

def tile_options(s,seat,tile,allow_wild=False,respect_limit=True):
    """Destination hints depend only on one tile and the public table."""
    if wild(s,tile) and not allow_wild:return []
    p=player(s,seat)
    if respect_limit and p.get('opened')=='pair' and s.get('pair_laid',0)>=2:return []
    out=[]
    for g in s['melds']:
        if g['kind']=='pair':continue
        for end in ('left','right'):
            if g['kind']=='set' and end=='left':continue
            if g['kind']=='run':
                f=[g['faces'][0][0],g['faces'][0][1]-1] if end=='left' else [g['faces'][-1][0],g['faces'][-1][1]+1]
                candidates=[f]
            else:candidates=[[c,g['faces'][0][1]] for c in range(4) if c not in [f[0] for f in g['faces']]]
            for f in candidates:
                try:
                    ts=([tile]+g['tiles']) if end=='left' else (g['tiles']+[tile])
                    fs=([f]+g['faces']) if end=='left' else (g['faces']+[f])
                    meld(s,ts,g['kind'],fs)
                except ValueError:continue
                out.append(dict(tile=tile,meld_id=g['id'],end=end,face=f))
    return out

def legal_lays(s,seat,tiles=None,allow_wild=True):
    p=player(s,seat)
    if not p.get('opened') or len(p['hand'])<2:return []
    chosen=p['hand'] if tiles is None else tiles
    return [o for t in chosen if t in p['hand'] for o in tile_options(s,seat,t,allow_wild)]

def auto_plan(s,seat,tiles=None):
    """Deterministic greedy plan; never automatically spends an okey or last discard tile."""
    trial=copy.deepcopy(s);p=player(trial,seat);plan=[]
    chosen=list(p['hand']) if tiles is None else list(tiles)
    if len(set(chosen))!=len(chosen) or not set(chosen)<=set(p['hand']):raise ValueError('İşlenecek taşlar elinizde olmalı.')
    while len(p['hand'])>1:
        opts=legal_lays(trial,seat,chosen,False)
        if not opts:break
        # Highest natural value first; stable table ID/order resolves equal choices.
        opts.sort(key=lambda o:(o['tile']!=trial.get('taken'),-face(trial,o['tile'])[1],o['tile'],o['meld_id'],o['end']))
        o=opts[0];lay(trial,seat,o['tile'],o['meld_id'],o['end'],o['face']);plan.append(o)
        chosen.remove(o['tile']);p=player(trial,seat)
    return plan

def auto_lay(s,seat,tiles=None,expected=None):
    check_turn(s,seat)
    plan=auto_plan(s,seat,tiles)
    if expected is not None and plan!=expected:raise ValueError('Masa değişti; işleme planını yeniden kontrol edin.')
    if not plan:raise ValueError('Otomatik işlenebilecek taş yok. Okeyi elle yerleştirebilirsiniz.')
    trial=copy.deepcopy(s)
    for o in plan:lay(trial,seat,o['tile'],o['meld_id'],o['end'],o['face'])
    s.clear();s.update(trial)
    return plan

def finish_hand(s,winner=None,okey_finish=False,direct=False):
    scores={};breakdown={}
    pair_finish=bool(winner and player(s,winner)['opened']=='pair')
    multiplier=(2 if okey_finish else 1)*(2 if pair_finish else 1)*(2 if direct else 1)
    for p in s['players']:
        held=0;base=0;factor=1
        if p['seat']==winner:score=-101*multiplier
        elif winner and s['mode']=='paired' and (p['seat']-winner)%2==0:score=0
        else:
            base=202 if not p['opened'] else sum(face(s,t)[1] for t in p['hand'])
            factor=multiplier*(2 if p['opened']=='pair' else 1)
            held=101*sum(wild(s,t) for t in p['hand'])
            score=base*factor+held
        points=p.get('penalty_points',0)
        scores[str(p['seat'])]=score+points;p['score']+=score
        breakdown[str(p['seat'])]=dict(base=base,multiplier=factor,held_okey=held,
            in_play=points,result=score+points,total=p['score'])
    s['history'].append(dict(hand=s['hand_number'],winner=winner,scores=scores))
    s['round_scores']=scores
    s['score_breakdown']=breakdown
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
    finishing=len(p['hand'])==1
    if not finishing:
        if wild(s,tile):penalty(s,seat,'discard_okey',101,tile=tile)
        elif tile_options(s,seat,tile,respect_limit=False):penalty(s,seat,'discard_working',101,tile=tile)
    p['hand'].remove(tile);s['discards'][str(seat)].append(tile);event(s,'discard',seat=seat,tile=tile)
    if not p['hand']:
        direct=(p.get('opened_turn')==s.get('turn_seq',0) and
                not any(q['opened'] for q in s['players'] if q['seat']!=seat))
        finish_hand(s,seat,wild(s,tile),direct)
    elif not s['stock']:finish_hand(s)
    else:next_turn(s)

def advance(s):
    if s['status']!='hand_finished':raise ValueError('El henüz bitmedi.')
    if not s.pop('redeal',False):s['hand_number']+=1
    deal(s)

def public(s,uid):
    out=copy.deepcopy(s);out['stock_count']=len(out.pop('stock',[]));out.pop('taken',None)
    for p in out['players']:
        hand=p.pop('hand',[]);p['hand_count']=len(hand)
        if p['user_id']==uid or s['status'] in ('hand_finished','finished'):p['hand']=hand
    return out

def candidate_groups(s,hand,pairs=False):
    """Bounded suggestions from the owner's hand, with explicit wildcard faces."""
    def pool_for(available):
        pool={};jokers=[]
        for t in sorted(available):
            if wild(s,t):jokers.append(t)
            else:pool.setdefault(face(s,t),[]).append(t)
        return pool,jokers
    if pairs:
        pool,jokers=pool_for(hand);out=[];left=[]
        for f,ids in sorted(pool.items(),key=lambda x:-x[0][1]):
            while len(ids)>=2:
                a,b=ids[:2];ids=ids[2:];out.append(dict(kind='pair',tiles=[a,b],faces=[list(f)]*2))
            if ids:left.append((f,ids[0]))
        for (f,t),j in zip(left,jokers):out.append(dict(kind='pair',tiles=[t,j],faces=[list(f)]*2))
        return out[:max(0,(len(hand)-1)//2)]
    def candidates(available):
        pool,jokers=pool_for(available);out=[]
        def make(kind,faces):
            missing=[f for f in faces if not pool.get(tuple(f))]
            if len(missing)>len(jokers):return
            js=iter(jokers);tiles=[pool[tuple(f)][0] if pool.get(tuple(f)) else next(js) for f in faces]
            if len(set(tiles))!=len(tiles):return
            out.append(dict(kind=kind,tiles=tiles,faces=faces))
        for c in range(4):
            for start in range(1,12):
                for end in range(start+2,14):make('run',[[c,n] for n in range(start,end+1)])
        import itertools
        for n in range(1,14):
            for length in (3,4):
                for colors in itertools.combinations(range(4),length):make('set',[[c,n] for c in colors])
        return out
    attempts=[]
    for mode in range(3):
        available=list(hand);groups=[]
        while True:
            opts=[g for g in candidates(available) if len(g['tiles'])<len(available)]
            if not opts:break
            def key(g):
                score=sum(f[1] for f in g['faces']);j=sum(wild(s,t) for t in g['tiles'])
                return ((score if mode==0 else len(g['tiles']) if mode==1 else len(g['tiles'])-j),score,-j)
            g=max(opts,key=key);groups.append(g)
            available=[t for t in available if t not in g['tiles']]
        attempts.append(groups)
    return max(attempts,key=lambda gs:sum(f[1] for g in gs for f in g['faces']))

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
    if s['status']!='playing':return
    if p['opened']:
        plan=auto_plan(s,seat)
        if plan:auto_lay(s,seat,expected=plan);p=player(s,seat)
    tile=max(p['hand'],key=lambda t:(not wild(s,t),face(s,t)[1]))
    discard(s,seat,tile)

def invariant(s):
    ids=[s['indicator'],*s['stock']]
    ids += [t for p in s['players'] for t in p['hand']]
    ids += [t for g in s['melds'] for t in g['tiles']]
    ids += [t for pile in s['discards'].values() for t in pile]
    assert sorted(ids)==list(range(106)), 'Physical tile conservation failed'
