import random


def play(choice, profile, data):
    entries = profile.get("results") or []
    wheel = [x[0] for x in entries]
    if not wheel:
        raise ValueError("roulette profile has no results")
    result = random.choices(wheel, weights=[x[1] for x in entries], k=1)[0]
    number = int(result)
    red_numbers = {1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36}
    color = "green" if number == 0 else "red" if number in red_numbers else "black"
    slot = wheel.index(result)
    frames = [((slot - i) % len(wheel)) for i in range(36)]
    hit = choice == result or (choice in {"red", "black"} and choice == color) or (choice == "even" and number != 0 and number % 2 == 0) or (choice == "odd" and number % 2 == 1)
    data.update({"wheel_order": wheel, "winning_slot": slot, "winning_number": number, "winning_color": color, "choice_hit": bool(choice and hit), "choice": choice,
                 "animation": {"type":"roulette_ball","steps":len(frames),"duration_ms":5200,"frames":frames,"final_slot":slot,"reveal_ms":700}})
    data["result"] = result
    return result, data
