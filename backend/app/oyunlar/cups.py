import random


def play(choice, profile, data):
    entries = profile.get("results") or []
    cups = [x[0] for x in entries]
    if not cups:
        raise ValueError("cups profile has no results")
    result = random.choices(cups, weights=[x[1] for x in entries], k=1)[0]
    data.update({
        "cups": cups,
        "winning_cup": result,
        "choice": choice,
        "choice_hit": bool(choice and choice == result),
        "animation": {"type": "cups_shuffle", "steps": 8, "duration_ms": 2400, "reveal": result},
    })
    data["result"] = result
    return result, data
