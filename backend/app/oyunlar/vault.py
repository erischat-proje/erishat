import random

def play(choice, profile, data):
    classes=[x[0] for x in profile["results"]]
    result=random.choices(classes,weights=[x[1] for x in profile["results"]],k=1)[0]
    items={"common":"coin_pack","rare":"crystal","epic":"phoenix_badge","legendary":"royal_chest","mythic":"mythic_crown"}
    data.update({"reward_class":result,"reward_item":items[result],"animation":{"type":"vault_open","rarity":result,"shake_ms":650}})
    return result,data
