import random

def play(choice, profile, data):
    segments=[x[0] for x in profile["results"]]
    result=random.choices(segments,weights=[x[1] for x in profile["results"]],k=1)[0]
    data.update({"segment":result,"segment_index":segments.index(result)+1,"choice_hit":bool(choice and choice==result),"animation":{"type":"wheel_spin","turns":6,"final_segment":segments.index(result)+1}})
    return result,data
