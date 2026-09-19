import random

def hand_total(hand):
    values={"J":10,"Q":10,"K":10,"A":11}
    total=0; aces=0
    for card in hand:
        rank=card[:-1]
        total += values[rank] if rank in values else int(rank)
        aces += int(rank == "A")
    while total>21 and aces:
        total-=10; aces-=1
    return total

def start(data):
    deck=[r+s for s in ["H","D","C","S"] for r in ["2","3","4","5","6","7","8","9","10","J","Q","K","A"]]
    random.shuffle(deck); player=[deck.pop(),deck.pop()]; dealer=[deck.pop(),deck.pop()]
    pt=hand_total(player); dt=hand_total(dealer); natural=len(player)==2 and pt==21; dealer_natural=len(dealer)==2 and dt==21
    result="pending"
    if natural and not dealer_natural: result="blackjack"
    elif natural and dealer_natural: result="push"
    elif dealer_natural: result="loss"
    data.update({"result":result,"player_hand":player,"dealer_hand":dealer,"player_total":pt,"dealer_total":dt,"natural_blackjack":natural,"dealer_natural":dealer_natural,"rules":"free-play multi-step blackjack; hit/stand; standard ace scoring","animation":{"type":"blackjack_deal","steps":4,"reveal":"dealer_second_card_last"},"state":{"phase":"finished" if result!="pending" else "player","deck":deck,"player_hand":player,"dealer_hand":dealer,"player_total":pt,"dealer_total":dt if result!="pending" else hand_total(dealer[:1]),"result":result,"natural_blackjack":natural,"dealer_natural":dealer_natural}})
    return result,data

def action(state, action):
    deck=list(state.get("deck") or []); player=list(state.get("player_hand") or []); dealer=list(state.get("dealer_hand") or [])
    if state.get("phase")!="player": raise ValueError("Oyuncu aksiyonu beklenmiyor")
    if action not in {"hit", "stand"}: raise ValueError("Geçersiz blackjack aksiyonu")
    if action=="hit":
        if not deck: raise ValueError("Deste tükendi")
        player.append(deck.pop()); total=hand_total(player)
        if total<21:
            state.update({"deck":deck,"player_hand":player,"player_total":total}); return "pending",state
    else: total=hand_total(player)
    total=hand_total(player)
    if total<=21:
        while hand_total(dealer)<17 and deck: dealer.append(deck.pop())
    dt=hand_total(dealer)
    result="loss" if total>21 or (dt<=21 and total<dt) else ("push" if total==dt else "win")
    state.update({"phase":"finished","deck":deck,"player_hand":player,"dealer_hand":dealer,"player_total":total,"dealer_total":dt,"result":result,"natural_blackjack":len(player)==2 and total==21,"dealer_natural":len(dealer)==2 and dt==21})
    return result,state
