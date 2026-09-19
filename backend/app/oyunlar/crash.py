import random

def play(choice, profile, data):
    classes=[x[0] for x in profile["results"]]
    result=random.choices(classes,weights=[x[1] for x in profile["results"]],k=1)[0]
    ranges={"x1_00_1_49":(1.0,1.49),"x1_50_1_99":(1.5,1.99),"x2_00_4_99":(2.0,4.99),"x5_00_9_99":(5.0,9.99),"x10_plus":(10.0,25.0)}
    lo,hi=ranges[result]
    data.update({"multiplier":round(random.uniform(lo,hi),2),"animation":{"type":"crash_curve","duration_ms":random.randint(2200,5200),"crash_at":round(random.uniform(lo,hi),2)}})
    data["animation"]["crash_at"]=data["multiplier"]
    return result,data
