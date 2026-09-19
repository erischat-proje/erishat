#!/usr/bin/env python3
"""Wallpaper catalog/ownership/apply smoke against the local API."""
from __future__ import annotations
import json, os
from urllib.error import HTTPError
from urllib.request import Request, urlopen

BASE=os.getenv("ERISCHAT_SMOKE_BASE_URL","http://127.0.0.1:8000").rstrip("/")
API=BASE+"/v1"

def req(method,path,token=None,payload=None):
    body=None if payload is None else json.dumps(payload).encode()
    h={"Accept":"application/json","Content-Type":"application/json"}
    if token: h["Authorization"]="Bearer "+token
    try:
        with urlopen(Request(API+path,data=body,headers=h,method=method),timeout=8) as r:
            raw=r.read().decode()
            return r.status,(json.loads(raw) if raw else {})
    except HTTPError as e:
        raw=e.read().decode()
        try: d=json.loads(raw)
        except Exception: d={"detail":raw}
        return e.code,d

s,d=req("POST","/users",payload={"nickname":"Wallpaper Smoke","avatar":"👤","gender":"male"})
if s>=300: raise RuntimeError(f"register failed: {s} {d}")
token=d.get("access_token") or d.get("token")
if not token: raise RuntimeError("missing token")

s,cat=req("GET","/wallpapers",token)
if s>=300: raise RuntimeError(f"wallpaper catalog failed: {s} {cat}")
items=cat.get("items",cat)
normal=[x for x in items if x.get("tier")=="normal"]
vip=[x for x in items if x.get("tier")=="vip"]
if len(normal)!=19 or len(vip)!=12:
    raise AssertionError(f"expected 19+12 wallpapers, got {len(normal)}+{len(vip)}")

for i,x in enumerate(sorted(normal,key=lambda x:int(x["asset_key"].split("_")[-1])),1):
    expected=f"Gereken_icerikler/duvarkagidi/normal/{i}.png"
    if x.get("asset")!=expected:
        raise AssertionError(f"normal wallpaper asset mismatch: {x}")
for i,x in enumerate(sorted(vip,key=lambda x:int(x.get("vip_level") or 0)),1):
    expected=f"Gereken_icerikler/duvarkagidi/vip/vip{i}.png"
    if x.get("asset")!=expected:
        raise AssertionError(f"VIP wallpaper asset mismatch: {x}")
    if x.get("asset_key")!=f"vip_wallpaper_{i:02d}":
        raise AssertionError(f"VIP wallpaper key mismatch: {x}")

s,me=req("GET","/me/wallpaper",token)
if s>=300: raise RuntimeError(f"initial wallpaper failed: {s} {me}")
item=normal[0]
s,buy=req("POST","/me/wallpaper/purchase",token,{"asset_key":item["asset_key"]})
if s>=300: raise RuntimeError(f"wallpaper purchase failed: {s} {buy}")
s,apply=req("POST","/me/wallpaper/apply",token,{"asset_key":item["asset_key"]})
if s>=300: raise RuntimeError(f"wallpaper apply failed: {s} {apply}")
s,after=req("GET","/me/wallpaper",token)
if s>=300 or after.get("asset_key")!=item["asset_key"]:
    raise AssertionError(f"wallpaper persistence failed: {s} {after}")

blocked=next(x for x in sorted(vip,key=lambda x:int(x.get("vip_level") or 0)) if int(x.get("vip_level") or 0)>0)
s,detail=req("POST","/me/wallpaper/apply",token,{"asset_key":blocked["asset_key"]})
if s!=403: raise AssertionError(f"VIP wallpaper gate expected 403, got {s} {detail}")

claim_key=next(x["asset_key"] for x in vip if int(x.get("vip_level") or 0)==10)
if claim_key!="vip_wallpaper_10":
    raise AssertionError(f"VIP10 wallpaper key mismatch: {claim_key}")
s,claim=req("POST","/me/vip/claims/wallpaper",token)
if s!=403: raise AssertionError(f"wallpaper claim below VIP 10 expected 403, got {s} {claim}")
print("Wallpaper smoke OK: 19 normal + 12 VIP uploaded PNG catalog, purchase/apply persistence, VIP gate, claim gate.")
