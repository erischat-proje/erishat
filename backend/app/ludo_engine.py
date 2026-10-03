"""Room Ludo rules. All dice, legal moves and outcomes are server-owned."""
from __future__ import annotations

import secrets
import time

TRACK = [(6,1),(6,2),(6,3),(6,4),(6,5),(5,6),(4,6),(3,6),(2,6),(1,6),(0,6),(0,7),(0,8),(1,8),(2,8),(3,8),(4,8),(5,8),(6,9),(6,10),(6,11),(6,12),(6,13),(6,14),(7,14),(8,14),(8,13),(8,12),(8,11),(8,10),(8,9),(9,8),(10,8),(11,8),(12,8),(13,8),(14,8),(14,7),(14,6),(13,6),(12,6),(11,6),(10,6),(9,6),(8,5),(8,4),(8,3),(8,2),(8,1),(8,0),(7,0),(6,0)]
STARTS = {1:0, 2:13, 3:26, 4:39}
SAFE = {8, 21, 34, 47}
STAKES = (50, 100, 150, 200, 250, 300)
TURN_SECONDS = 30

def event(s, kind, **data):
    s['version'] += 1
    s['events'].append(dict(seq=s['version'], kind=kind, **data))
    s['events'] = s['events'][-64:]

def player(s, seat):
    return next(p for p in s['players'] if p['seat'] == seat)

def allied(s, a, b):
    return a == b or s['mode'] == 'paired' and (a-1)//2 == (b-1)//2

def target(pos, die):
    if pos == -1:
        return 0 if die == 6 else None
    return pos + die if pos < 56 and pos + die <= 56 else None

def captures(s, seat, destination):
    if destination is None or destination > 50:
        return []
    square = (STARTS[seat] + destination) % 52
    if square in SAFE:
        return []
    return [dict(seat=p['seat'], token=i, pos=pos) for p in s['players']
            if not allied(s, seat, p['seat']) for i, pos in enumerate(p['tokens'])
            if 0 <= pos <= 50 and (STARTS[p['seat']] + pos) % 52 == square]

def occupied_by_other(s, seat, destination):
    """Bots avoid even protected stars and team-mates, not merely captures."""
    if destination is None or destination > 50:
        return False
    square = (STARTS[seat] + destination) % 52
    return any(0 <= pos <= 50 and (STARTS[p['seat']] + pos) % 52 == square
               for p in s['players'] if p['seat'] != seat for pos in p['tokens'])

def legal(s, seat, die=None, harmless=False):
    die = die or s.get('die')
    if not die:
        return []
    return [i for i, pos in enumerate(player(s, seat)['tokens'])
            if target(pos, die) is not None and
            (not harmless or not occupied_by_other(s, seat, target(pos, die)))]

def begin(s, now=None):
    seats = sorted(p['seat'] for p in s['players'])
    if len(seats) not in (2, 4) or s['mode'] == 'paired' and seats != [1,2,3,4]:
        raise ValueError('Tekli oyun 2 veya 4; eşli oyun dört oyuncuyla başlar.')
    s.update(status='playing', turn=seats[0], die=None, sixes=0,
             deadline=(now or time.time()) + TURN_SECONDS, winners=[])
    event(s, 'start')

def next_turn(s, now=None):
    seats = sorted(p['seat'] for p in s['players'])
    seat = s['turn']
    for offset in range(1, len(seats)+1):
        candidate = seats[(seats.index(seat)+offset) % len(seats)]
        if not all(pos == 56 for pos in player(s, candidate)['tokens']):
            s['turn'] = candidate
            break
    s.update(die=None, sixes=0, deadline=(now or time.time())+TURN_SECONDS)

def roll(s, bot=False, now=None):
    if s['status'] != 'playing' or s.get('die'):
        raise ValueError('Şimdi zar atılamaz.')
    seat = s['turn']
    # Choose a face with a safe destination; the bot then selects only safe tokens.
    # Rejecting faces for unused tokens as well could deadlock a crowded board.
    faces = [d for d in range(1,7) if not bot or
             legal(s,seat,d,harmless=True) or not legal(s,seat,d)]
    if not faces:
        event(s, 'pass', seat=seat, reason='Bot güvenli hamle bulamadı.')
        next_turn(s, now)
        return
    die = secrets.choice(faces)
    s['die'] = die
    s['sixes'] = s['sixes']+1 if die == 6 else 0
    event(s, 'roll', seat=seat, die=die)
    if s['sixes'] == 3:
        event(s, 'pass', seat=seat, reason='Üçüncü 6 geçersiz; sıra değişti.')
        next_turn(s, now)
    elif not legal(s, seat, harmless=bot):
        event(s, 'pass', seat=seat, reason='Uygun piyon yok.')
        if die == 6:
            s.update(die=None, deadline=(now or time.time())+TURN_SECONDS)
        else:
            next_turn(s, now)
    else:
        s['deadline'] = (now or time.time())+TURN_SECONDS

def move(s, token, bot=False, now=None):
    seat = s['turn']
    if token not in legal(s, seat, harmless=bot):
        raise ValueError('Bu piyon hareket edemez.')
    p = player(s, seat)
    before, die = p['tokens'][token], s['die']
    after = target(before, die)
    taken = captures(s, seat, after)
    for hit in taken:
        player(s, hit['seat'])['tokens'][hit['token']] = -1
    p['tokens'][token] = after
    event(s, 'move', seat=seat, token=token, before=before, after=after, captured=taken)
    winners = ([q['seat'] for q in s['players'] if allied(s, seat, q['seat'])]
               if s['mode'] == 'paired' else [seat])
    if all(all(pos == 56 for pos in player(s,n)['tokens']) for n in winners):
        s.update(status='finished', winners=winners, die=None, deadline=0)
        event(s, 'win', winners=winners)
    elif die == 6 and not all(pos == 56 for pos in p['tokens']):
        s.update(die=None, deadline=(now or time.time())+TURN_SECONDS)
    else:
        next_turn(s, now)

def bot_step(s, now=None):
    if not s.get('die'):
        roll(s, bot=True, now=now)
    else:
        choices = legal(s, s['turn'], harmless=True)
        if choices:
            p = player(s,s['turn'])
            move(s,max(choices,key=lambda i:target(p['tokens'][i],s['die'])),bot=True,now=now)
        else:
            event(s,'pass',seat=s['turn'],reason='Bot piyon yakalayamaz; sıra değişti.')
            next_turn(s,now)
