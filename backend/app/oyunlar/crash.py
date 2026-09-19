import random

RANGES={"x1_00_1_49":(1.0,1.49),"x1_50_1_99":(1.5,1.99),"x2_00_4_99":(2.0,4.99),"x5_00_9_99":(5.0,9.99),"x10_plus":(10.0,25.0)}


def play(choice, profile, data):
    entries=profile.get("results") or []
    classes=[x[0] for x in entries]
    if not classes: raise ValueError("crash profile has no results")
    result=random.choices(classes,weights=[x[1] for x in entries],k=1)[0]
    lo,hi=RANGES[result]
    multiplier=round(random.uniform(lo,hi),2)
    steps=12
    curve=[round(1.0+(multiplier-1.0)*((i+1)/steps)**2,2) for i in range(steps)]
    data.update({"result_class":result,"multiplier":multiplier,"animation":{"type":"crash_curve","duration_ms":random.randint(2200,5200),"curve":curve,"crash_at":multiplier,"final_step":steps}})
    data["result"]=result
    return result,data
