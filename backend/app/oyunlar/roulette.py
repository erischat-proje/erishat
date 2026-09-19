import random

def play(choice, profile, data):
    wheel = [x[0] for x in profile["results"]]
    result = random.choices(wheel, weights=[x[1] for x in profile["results"]], k=1)[0]
    data.update({"wheel_order": wheel, "winning_slot": wheel.index(result)+1, "choice_hit": bool(choice and choice == result), "animation": {"type":"roulette_spin","steps":18,"final_slot":wheel.index(result)+1}})
    return result, data
