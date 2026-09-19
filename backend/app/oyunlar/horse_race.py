import random

def play(choice, profile, data):
    results=[x[0] for x in profile["results"]]
    result=random.choices(results,weights=[x[1] for x in profile["results"]],k=1)[0]
    order=[result]+[x for x in results if x!=result]
    random.shuffle(order[1:])
    data.update({"finish_order":order,"positions":{h:i+1 for i,h in enumerate(order)},"podium":order[:3],"animation":{"type":"horse_race","steps":24,"finish_order":order},"choice_hit":bool(choice and choice==result),"choice_position":({h:i+1 for i,h in enumerate(order)}).get(choice) if choice else None})
    return result,data
