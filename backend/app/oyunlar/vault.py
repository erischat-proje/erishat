import random

ITEMS = {
    "common": "coin_pack",
    "rare": "crystal",
    "epic": "phoenix_badge",
    "legendary": "royal_chest",
    "mythic": "mythic_crown",
}


def play(choice, profile, data):
    entries = profile.get("results") or []
    classes = [x[0] for x in entries]
    if not classes:
        raise ValueError("vault profile has no results")
    result = random.choices(classes, weights=[x[1] for x in entries], k=1)[0]
    item = ITEMS.get(result, result)
    data.update({
        "reward_class": result,
        "reward_item": item,
        "choice": choice,
        "animation": {"type": "vault_open", "rarity": result, "shake_ms": 650, "reveal_ms": 900},
    })
    data["result"] = result
    return result, data
