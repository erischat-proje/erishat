import random


def play(choice, profile, data):
    entries = profile.get("results") or []
    horses = [x[0] for x in entries]
    if not horses:
        raise ValueError("horse race profile has no results")
    winner = random.choices(horses, weights=[x[1] for x in entries], k=1)[0]
    rest = [x for x in horses if x != winner]
    random.shuffle(rest)
    order = [winner] + rest
    positions = {horse:i+1 for i,horse in enumerate(order)}
    checkpoints = []
    for step in range(1, 5):
        checkpoints.append({horse: min(100, step*25 + random.randint(-6, 6)) for horse in horses})
    data.update({"horses":horses,"finish_order":order,"positions":positions,"podium":order[:3],"choice":choice,
                 "choice_hit":bool(choice and choice==winner),"choice_position":positions.get(choice) if choice else None,
                 "animation":{"type":"horse_race","steps":24,"duration_ms":5200,"checkpoints":checkpoints,"finish_order":order}})
    data["result"] = winner
    return winner, data
