import random


def play(choice, profile, data):
    entries = profile.get("results") or []
    wheel = [x[0] for x in entries]
    if not wheel:
        raise ValueError("roulette profile has no results")
    result = random.choices(wheel, weights=[x[1] for x in entries], k=1)[0]
    slot = wheel.index(result) + 1
    frames = [((slot - 1 + i) % len(wheel)) + 1 for i in range(18)]
    data.update({"wheel_order": wheel, "winning_slot": slot, "choice_hit": bool(choice and choice == result), "choice": choice,
                 "animation": {"type":"roulette_spin","steps":len(frames),"duration_ms":3600,"frames":frames,"final_slot":slot,"reveal_ms":700}})
    data["result"] = result
    return result, data
