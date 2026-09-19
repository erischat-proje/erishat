import random


def play(choice, profile, data):
    entries=profile.get("results") or []
    segments=[x[0] for x in entries]
    if not segments: raise ValueError("wheel profile has no results")
    result=random.choices(segments,weights=[x[1] for x in entries],k=1)[0]
    index=segments.index(result)+1
    total=6*len(segments)+index
    frames=[(i % len(segments))+1 for i in range(total)]
    data.update({"segments":segments,"segment":result,"segment_index":index,"choice":choice,"choice_hit":bool(choice and choice==result),
                 "animation":{"type":"wheel_spin","turns":6,"duration_ms":4200,"frames":frames,"final_segment":index,"reveal_ms":700}})
    data["result"]=result
    return result,data
