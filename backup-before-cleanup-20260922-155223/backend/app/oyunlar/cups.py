import random


def play(choice, profile, data):
    entries = profile.get("results") or []
    cups = [x[0] for x in entries]
    if not cups:
        raise ValueError("cups profile has no results")
    result = random.choices(cups, weights=[x[1] for x in entries], k=1)[0]
    order = cups[:]
    random.shuffle(order)
    if result in order:
        order.remove(result)
        order.insert(random.randrange(len(order) + 1), result)
    data.update({"cups": cups,"shuffle_order": order,"winning_cup": result,"choice": choice,"choice_hit": bool(choice and choice == result),
                 "animation":{"type":"cups_shuffle","steps":8,"duration_ms":2400,"shuffle_order":order,"reveal":result,"reveal_ms":700}})
    data["result"] = result
    return result, data
