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

def can_double(state):
    return state.get("phase") == "player" and len(state.get("player_hand") or []) == 2 and bool(state.get("deck"))

def can_split(state):
    hand = state.get("player_hand") or []
    return state.get("phase") == "player" and len(hand) == 2 and hand[0][:-1] == hand[1][:-1]

def action(state, action):
    deck=list(state.get("deck") or [])
    dealer=list(state.get("dealer_hand") or [])
    hands=list(state.get("hands") or [{"cards": list(state.get("player_hand") or []), "done": False}])
    active=int(state.get("active_hand", 0))
    if state.get("phase") != "player":
        raise ValueError("Oyuncu aksiyonu beklenmiyor")
    if active < 0 or active >= len(hands):
        raise ValueError("Geçersiz aktif el")
    hand=hands[active]
    player=list(hand.get("cards") or [])
    if hand.get("done"):
        raise ValueError("Bu el tamamlandı")
    if action not in {"hit", "stand", "double", "split"}:
        raise ValueError("Geçersiz blackjack aksiyonu")

    if action == "split":
        if len(hands) != 1 or not can_split(state):
            raise ValueError("Split bu aşamada kullanılamaz")
        if len(deck) < 2:
            raise ValueError("Split için deste yetersiz")
        a,b=player
        first=[a, deck.pop()]
        second=[b, deck.pop()]
        hands=[{"cards": first, "done": False, "result": "pending"},
               {"cards": second, "done": False, "result": "pending"}]
        state.update({"deck":deck,"hands":hands,"active_hand":0,"player_hand":first,"player_total":hand_total(first),"split":True})
        return "pending", state

    if action == "double":
        if len(hands) != 1 or not can_double(state):
            raise ValueError("Double bu aşamada kullanılamaz")
        if not deck:
            raise ValueError("Deste tükendi")
        player.append(deck.pop())
        hand["cards"]=player; hand["done"]=True
    elif action == "hit":
        if not deck:
            raise ValueError("Deste tükendi")
        player.append(deck.pop())
        hand["cards"]=player
        if hand_total(player) >= 21:
            hand["done"]=True
    else:
        hand["done"]=True

    if len(hands) > 1 and not hand["done"]:
        state.update({"deck":deck,"hands":hands,"active_hand":active,"player_hand":player,"player_total":hand_total(player)})
        return "pending", state

    if len(hands) > 1 and hand["done"] and active + 1 < len(hands):
        active += 1
        nxt=hands[active]["cards"]
        state.update({"deck":deck,"hands":hands,"active_hand":active,"player_hand":nxt,"player_total":hand_total(nxt)})
        return "pending", state

    while hand_total(dealer) < 17 and deck:
        dealer.append(deck.pop())
    dealer_total=hand_total(dealer)
    results=[]
    for h in hands:
        total=hand_total(h["cards"])
        result="loss" if total>21 or (dealer_total<=21 and total<dealer_total) else ("push" if total==dealer_total else "win")
        h["result"]=result
        results.append(result)
    overall=results[0] if len(results)==1 else "split_complete"
    final_hand=hands[active]["cards"]
    state.update({
        "phase":"finished","deck":deck,"hands":hands,"active_hand":active,
        "player_hand":final_hand,"player_total":hand_total(final_hand),
        "dealer_hand":dealer,"dealer_total":dealer_total,"result":overall,
    })
    return overall,state

