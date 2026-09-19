import random


def play(choice, profile, data):
    entries = profile.get("results") or []
    wheel = [x[0] for x in entries]
    if not wheel:
        raise ValueError("roulette profile has no results")
    weights = [x[1] for x in entries]
    result = random.choices(wheel, weights=weights, k=1)[0]
    slot = wheel.index(result) + 1
    data.update({
        "wheel_order": wheel,
        "winning_slot": slot,
        "choice_hit": bool(choice and choice == result),
        "choice": choice,
        "animation": {"type": "roulette_spin", "steps": 18, "duration_ms": 3600, "final_slot": slot},
    })
    data["result"] = result
    return result, data
