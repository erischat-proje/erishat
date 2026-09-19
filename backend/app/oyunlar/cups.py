import random

def play(choice, profile, data):
    results = [x[0] for x in profile["results"]]
    result = random.choices(results, weights=[x[1] for x in profile["results"]], k=1)[0]
    data.update({"winning_cup":result,"choice_hit":bool(choice and choice == result),"animation":{"type":"cups_shuffle","steps":8,"reveal":result}})
    data["result"] = result
    return result, data
