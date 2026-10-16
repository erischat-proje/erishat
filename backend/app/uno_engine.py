"""Room UNO: classic cards plus one optional Wild Swap Hands. Pure rules; hidden state never leaves the server."""
from __future__ import annotations
import copy
import secrets
from uuid import uuid4

COLORS = ('red', 'yellow', 'green', 'blue')
TURN_SECONDS = 20

class RuleError(ValueError):
    pass

def deck():
    cards = []
    for color in COLORS:
        cards.append(dict(id=len(cards), color=color, value='0'))
        for value in [str(n) for n in range(1, 10)] + ['skip', 'reverse', 'draw2']:
            for _ in range(2):
                cards.append(dict(id=len(cards), color=color, value=value))
    for value in ('wild', 'draw4'):
        for _ in range(4):
            cards.append(dict(id=len(cards), color=None, value=value))
    cards.append(dict(id=len(cards), color=None, value='swap'))
    return cards

CARDS = deck()

def card(cid):
    if type(cid) is not int or not 0 <= cid < len(CARDS):
        raise RuleError('Geçersiz kart.')
    return CARDS[cid]

def event(s, kind, **extra):
    s['version'] += 1
    s.setdefault('events', []).append(dict(seq=s['version'], kind=kind, **extra))
    s['events'] = s['events'][-30:]

def player(s, seat):
    return next(p for p in s['players'] if p['seat'] == seat)

def next_seat(s, seat, steps=1):
    order = [p['seat'] for p in s['players']]
    return order[(order.index(seat) + s['direction'] * steps) % len(order)]

def new_game(host, mode, victory, now):
    return dict(round_id=str(uuid4()), host=host, mode=mode, victory=victory,
                status='lobby', version=0, players=[], events=[], expires=now+600,
                hand_no=0, scores={}, dealer=None)

def advance(s, seat, now):
    s.update(turn=seat, phase='play', drawn=None, pending_draw4=None, deadline=now+TURN_SECONDS)

def draw_cards(s, seat, count):
    p = player(s, seat)
    drawn = []
    for _ in range(count):
        if not s['stock'] and len(s['discard']) > 1:
            s['stock'] = s['discard'][:-1]
            s['discard'] = s['discard'][-1:]
            secrets.SystemRandom().shuffle(s['stock'])
        if not s['stock']:
            break
        cid = s['stock'].pop()
        p['hand'].append(cid)
        drawn.append(cid)
    if len(p['hand']) != 1:
        p['uno'] = False
        vulnerable = [n for n in s.get('uno_vulnerable_seats', [s.get('uno_vulnerable')]) if n is not None and n != seat]
        s['uno_vulnerable_seats'] = vulnerable
        s['uno_vulnerable'] = vulnerable[0] if vulnerable else None
    return drawn

def start_hand(s, now):
    if not 2 <= len(s['players']) <= 4 or (s['mode'] == 'paired' and len(s['players']) != 4):
        raise RuleError('Tekli 2–4, eşli tam 4 oyuncu gerektirir.')
    s.pop('hand_expires', None)
    s.pop('challenge_reveal', None)
    s['players'].sort(key=lambda p: p['seat'])
    s['direction'] = 1
    s['dealer'] = next_seat(s, s['dealer']) if s['dealer'] is not None else s['players'][-1]['seat']
    s.update(stock=list(range(len(CARDS))), discard=[], uno_vulnerable=None, uno_vulnerable_seats=[], pending_draw4=None,
             drawn=None, status='playing', hand_no=s['hand_no']+1, winners=[], hand_winners=[])
    secrets.SystemRandom().shuffle(s['stock'])
    for p in s['players']:
        p.update(hand=[], uno=False)
        draw_cards(s, p['seat'], 7)
    first = next_seat(s, s['dealer'])
    # A starting +4 is returned before choosing a replacement.
    while card(s['stock'][-1])['value'] == 'draw4':
        secrets.SystemRandom().shuffle(s['stock'])
    top = s['stock'].pop()
    s['discard'] = [top]
    s['active_color'] = card(top)['color']
    advance(s, first, now)
    value = card(top)['value']
    if value == 'draw2':
        draw_cards(s, first, 2)
        advance(s, next_seat(s, first), now)
    elif value == 'skip':
        advance(s, next_seat(s, first), now)
    elif value == 'reverse':
        s['direction'] = -1
        # In two-player UNO Reverse skips the initial player.
        advance(s, s['dealer'], now)
    elif value in ('wild', 'swap'):
        s['phase'] = 'opening_color'
    event(s, 'deal', hand_no=s['hand_no'])

def matches(s, cid):
    c, top = card(cid), card(s['discard'][-1])
    return c['color'] is None or c['color'] == s['active_color'] or c['value'] == top['value']

def legal(s, seat):
    if s['status'] != 'playing' or s['turn'] != seat or s['phase'] not in ('play', 'drawn'):
        return []
    return [cid for cid in player(s, seat)['hand'] if matches(s, cid)
            and (s['phase'] != 'drawn' or cid == s['drawn'])]

def points(hand):
    return sum(int(card(c)['value']) if card(c)['value'].isdigit()
               else 40 if card(c)['value'] == 'swap' else 50 if card(c)['color'] is None else 20 for c in hand)

def finish(s, seat):
    winner = player(s, seat)
    winners = [p['seat'] for p in s['players'] if s['mode'] == 'paired' and p['team'] == winner['team'] or p['seat'] == seat]
    score = sum(points(p['hand']) for p in s['players'] if p['seat'] not in winners)
    key = str(winner['team'] if s['mode'] == 'paired' else seat)
    s['scores'][key] = s['scores'].get(key, 0) + score
    match_over = s['victory'] == 'quick' or s['scores'][key] >= 500
    s.update(status='finished' if match_over else 'hand_finished', hand_winners=winners,
             winners=winners if match_over else [], hand_points=score, deadline=None,
             phase='result', pending_draw4=None, uno_vulnerable=None, uno_vulnerable_seats=[])
    event(s, 'win', seats=winners, points=score, match_over=match_over)

def require_turn(s, seat):
    if s['status'] != 'playing' or s['turn'] != seat:
        raise RuleError('Sıra sizde değil.')

def begin_action(s):
    # Catch window closes when the next player plays or draws, not on a poll.
    s['uno_vulnerable'] = None
    s['uno_vulnerable_seats'] = []

def play(s, seat, cid, color, call_uno, now, swap_target=None):
    require_turn(s, seat)
    if cid not in legal(s, seat):
        raise RuleError('Bu kart şu anda oynanamaz.')
    c = card(cid)
    if c['color'] is None and color not in COLORS:
        raise RuleError('Joker için renk seçin.')
    p = player(s, seat)
    other = None
    if c['value'] == 'swap' and len(p['hand']) > 1:
        if type(swap_target) is not int:
            raise RuleError('El değişimi için oyuncu seçin veya elinizi koruyun.')
        other = next((q for q in s['players'] if q['seat'] == swap_target), None)
        if not other or (s['mode'] == 'paired' and other['seat'] != seat and other['team'] == p['team']):
            raise RuleError('Geçerli bir rakip seçin.')
    previous_color = s['active_color']
    illegal4 = c['value'] == 'draw4' and any(card(x)['color'] == s['active_color'] for x in p['hand'] if x != cid)
    begin_action(s)
    p['hand'].remove(cid)
    p['uno'] = bool(call_uno and len(p['hand']) == 1)
    if len(p['hand']) == 1 and not p['uno']:
        s['uno_vulnerable'] = seat
        s['uno_vulnerable_seats'] = [seat]
    s['discard'].append(cid)
    s['active_color'] = color if c['color'] is None else c['color']
    target = next_seat(s, seat)
    event(s, 'play', seat=seat, card=cid, color=s['active_color'], uno=p['uno'])
    if c['value'] == 'draw4':
        advance(s, target, now)
        s.update(phase='challenge', pending_draw4=dict(actor=seat, target=target, illegal=illegal4,
                 evidence=list(p['hand']), previous_color=previous_color, finishing=not p['hand']))
        return
    if c['value'] == 'swap' and p['hand'] and other is not None and other['seat'] != seat:
        p['hand'], other['hand'] = other['hand'], p['hand']
        p['uno'] = bool(call_uno and len(p['hand']) == 1)
        other['uno'] = False
        vulnerable = [q['seat'] for q in (p, other) if len(q['hand']) == 1 and not q['uno']]
        s['uno_vulnerable_seats'] = vulnerable
        s['uno_vulnerable'] = vulnerable[0] if vulnerable else None
        event(s, 'swap', seat=seat, target=other['seat'])
    if c['value'] == 'reverse':
        s['direction'] *= -1
        target = seat if len(s['players']) == 2 else next_seat(s, seat)
    elif c['value'] == 'skip':
        target = next_seat(s, seat, 2)
    elif c['value'] == 'draw2':
        draw_cards(s, target, 2)
        event(s, 'penalty', seat=target, count=2)
        target = next_seat(s, target)
    if not p['hand']:
        finish(s, seat)
    else:
        # Preserve the just-created UNO catch window through the turn transition.
        advance(s, target, now)

def draw(s, seat, now, auto_pass=False):
    require_turn(s, seat)
    if s['phase'] != 'play':
        raise RuleError('Şu anda kart çekilemez.')
    begin_action(s)
    cards = draw_cards(s, seat, 1)
    event(s, 'draw', seat=seat, count=len(cards), automatic=auto_pass)
    if cards and matches(s, cards[0]) and not auto_pass:
        s.update(phase='drawn', drawn=cards[0], deadline=now+TURN_SECONDS)
    else:
        advance(s, next_seat(s, seat), now)

def pass_turn(s, seat, now):
    require_turn(s, seat)
    if s['phase'] != 'drawn':
        raise RuleError('Önce kart çekmelisiniz.')
    begin_action(s)
    advance(s, next_seat(s, seat), now)
    event(s, 'pass', seat=seat)

def choose_color(s, seat, color, now):
    require_turn(s, seat)
    if s['phase'] != 'opening_color' or color not in COLORS:
        raise RuleError('Başlangıç rengini seçin.')
    s['active_color'] = color
    advance(s, seat, now)
    event(s, 'color', seat=seat, color=color)

def answer_draw4(s, seat, challenge, now):
    require_turn(s, seat)
    pending = s.get('pending_draw4')
    if s['phase'] != 'challenge' or not pending or pending['target'] != seat:
        raise RuleError('İtiraz edilebilecek +4 yok.')
    begin_action(s)
    guilty = bool(challenge and pending['illegal'])
    punished = pending['actor'] if guilty else seat
    count = 4 if guilty or not challenge else 6
    draw_cards(s, punished, count)
    if challenge:
        # Only this challenger can inspect evidence; never put it in public events.
        s['challenge_reveal'] = dict(viewer=player(s, seat)['user_id'], cards=pending['evidence'],
                                     actor=pending['actor'], color=pending.get('previous_color'), guilty=guilty)
    event(s, 'challenge' if challenge else 'accept4', seat=seat, guilty=guilty, punished=punished, count=count)
    if pending['finishing'] and not guilty:
        finish(s, pending['actor'])
    else:
        advance(s, seat if guilty else next_seat(s, seat), now)

def call(s, seat):
    p = player(s, seat)
    if s['status'] != 'playing' or len(p['hand']) != 1:
        raise RuleError('UNO demek için tek kartınız kalmalı.')
    if p['uno']:
        raise RuleError('Zaten UNO dediniz.')
    p['uno'] = True
    vulnerable = [n for n in s.get('uno_vulnerable_seats', [s.get('uno_vulnerable')]) if n is not None and n != seat]
    s['uno_vulnerable_seats'] = vulnerable
    s['uno_vulnerable'] = vulnerable[0] if vulnerable else None
    event(s, 'uno', seat=seat)

def catch(s, seat):
    vulnerable = [n for n in s.get('uno_vulnerable_seats', [s.get('uno_vulnerable')]) if n is not None and n != seat and len(player(s, n)['hand']) == 1 and not player(s, n)['uno']]
    target = vulnerable[0] if vulnerable else None
    if s['status'] != 'playing' or target is None or target == seat:
        raise RuleError('Yakalanabilecek oyuncu yok.')
    remaining = [n for n in s.get('uno_vulnerable_seats', []) if n != target]
    draw_cards(s, target, 2)
    s['uno_vulnerable_seats'] = remaining
    s['uno_vulnerable'] = remaining[0] if remaining else None
    event(s, 'catch', seat=seat, target=target, count=2)

def timeout(s, now, bot=False):
    seat = s['turn']
    if s['phase'] == 'challenge':
        answer_draw4(s, seat, False, now)
    elif s['phase'] == 'opening_color':
        counts = {c: sum(card(cid)['color'] == c for cid in player(s, seat)['hand']) for c in COLORS}
        choose_color(s, seat, max(counts, key=counts.get), now)
    elif bot and legal(s, seat):
        cid = max(legal(s, seat), key=lambda x: points([x]))
        counts = {c: sum(card(x)['color'] == c for x in player(s, seat)['hand']) for c in COLORS}
        # A disconnected bot does not bluff with an illegal +4.
        if card(cid)['value'] == 'draw4' and counts.get(s['active_color'], 0):
            draw(s, seat, now, auto_pass=True) if s['phase'] == 'play' else pass_turn(s, seat, now)
        else:
            swap_target = None
            if card(cid)['value'] == 'swap':
                opponents = [q for q in s['players'] if q['seat'] != seat
                             and (s['mode'] != 'paired' or q['team'] != player(s, seat)['team'])]
                swap_target = min(opponents, key=lambda q: len(q['hand']))['seat']
            play(s, seat, cid, max(counts, key=counts.get), True, now, swap_target=swap_target)
    elif s['phase'] == 'drawn':
        pass_turn(s, seat, now)
    else:
        draw(s, seat, now, auto_pass=True)

def public_state(s, uid):
    """Allowlist projection: no stock order, other hands, or bluff verdict leaks."""
    if not s:
        return None
    out = {k: copy.deepcopy(s.get(k)) for k in ('round_id','host','mode','victory','status','version',
           'expires','hand_no','scores','dealer','turn','phase','direction','active_color','deadline',
           'winners','hand_winners','hand_points','events','uno_vulnerable','uno_vulnerable_seats',
           'stake','pool','settled','refunded','payouts')}
    out['players'] = []
    for p in s['players']:
        q = {k: p.get(k) for k in ('seat','user_id','name','team','uno','bot','disconnected_at','stake')}
        q['card_count'] = len(p.get('hand', []))
        if p['user_id'] == uid:
            q['hand'] = list(p.get('hand', []))
        out['players'].append(q)
    out['top_card'] = s.get('discard', [None])[-1] if s.get('discard') else None
    out['stock_count'] = len(s.get('stock', []))
    me = next((p for p in s['players'] if p['user_id'] == uid), None)
    out['legal'] = legal(s, me['seat']) if me and s['status'] == 'playing' else []
    out['drawn'] = s.get('drawn') if me and me['seat'] == s.get('turn') else None
    pending = s.get('pending_draw4')
    if pending and s.get('phase') == 'challenge':
        out['draw4_question'] = {k: pending.get(k) for k in ('actor', 'target', 'previous_color')}
    reveal = s.get('challenge_reveal')
    if reveal and reveal['viewer'] == uid:
        out['challenge_reveal'] = copy.deepcopy(reveal)
    return out
