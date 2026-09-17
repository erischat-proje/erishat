#!/usr/bin/env python3
"""Opt-in smoke harness for ErisChat cosmetic purchase/apply APIs.

Defaults to localhost and never deploys or touches production automatically.
Set ERISCHAT_SMOKE_BASE_URL explicitly to target another running environment.
"""
from __future__ import annotations

import json
import os
import sys
from urllib.error import HTTPError
from urllib.request import Request, urlopen

BASE = os.getenv("ERISCHAT_SMOKE_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
API = BASE + "/v1"
TIMEOUT = float(os.getenv("ERISCHAT_SMOKE_TIMEOUT", "8"))


def request(method: str, path: str, token: str | None = None, payload=None):
    body = None if payload is None else json.dumps(payload).encode()
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = Request(API + path, data=body, headers=headers, method=method)
    try:
        with urlopen(req, timeout=TIMEOUT) as response:
            raw = response.read().decode()
            return response.status, (json.loads(raw) if raw else {})
    except HTTPError as exc:
        raw = exc.read().decode()
        try:
            data = json.loads(raw)
        except Exception:
            data = {"detail": raw}
        return exc.code, data


def register():
    status, data = request("POST", "/users", payload={
        "nickname": "Cosmetic Smoke", "avatar": "👤", "gender": "male"
    })
    if status >= 300:
        raise RuntimeError(f"anonymous auth failed: HTTP {status} {data}")
    token = data.get("access_token") or data.get("token")
    if not token:
        raise RuntimeError(f"anonymous auth response has no token: {data}")
    return token


def main() -> int:
    print(f"ErisChat cosmetic smoke target: {API}")
    token = register()

    status, catalog = request("GET", "/cosmetics")
    if status >= 300:
        raise RuntimeError(f"catalog failed: HTTP {status} {catalog}")
    items = catalog.get("items") if isinstance(catalog, dict) else catalog
    if not isinstance(items, list) or not items:
        raise RuntimeError("cosmetic catalog is empty")

    counts = {
        "avatar": sum(1 for x in items if x.get("type") == "avatar" and not x.get("vip")),
        "frame": sum(1 for x in items if x.get("type") == "frame" and not x.get("vip")),
        "vip_avatar": sum(1 for x in items if x.get("type") == "avatar" and x.get("vip")),
        "vip_frame": sum(1 for x in items if x.get("type") == "frame" and x.get("vip")),
    }
    expected = {"avatar": 71, "frame": 32, "vip_avatar": 24, "vip_frame": 12}
    if counts != expected or len(items) != 139:
        raise RuntimeError(f"catalog inventory mismatch: counts={counts}, total={len(items)}, expected={expected}, total=139")
    print(f"catalog inventory OK: {len(items)} items; {counts}")

    avatar = next((x for x in items if x.get("type") == "avatar" and not x.get("vip")), None)
    frame = next((x for x in items if x.get("type") == "frame" and not x.get("vip")), None)
    vip_asset = next((x for x in items if x.get("vip") and x.get("vip_level") == 1), None)
    if not avatar or not frame or not vip_asset:
        raise RuntimeError("catalog must contain standard avatar, standard frame, and VIP level 1 asset")

    status, me = request("GET", "/me", token)
    if status >= 300:
        raise RuntimeError(f"/me failed: HTTP {status} {me}")
    balance = int(me.get("lidya") or me.get("balance") or 0)
    print(f"catalog OK; starting Lidya={balance}")

    def exercise(item):
        key = item.get("asset_key")
        kind = item.get("type")
        price = int(item.get("price") or 0)
        if not key or kind not in {"avatar", "frame"}:
            raise RuntimeError(f"invalid catalog item: {item}")
        if balance < price:
            print(f"SKIP {kind}: balance {balance} < price {price}")
            return
        status, purchase = request("POST", "/me/cosmetics/purchase", token, {
            "cosmetic_type": kind, "asset_key": key,
        })
        if status >= 300:
            raise RuntimeError(f"{kind} purchase failed: HTTP {status} {purchase}")
        if purchase.get("asset_key") != key or purchase.get("cosmetic_type") != kind:
            raise AssertionError(f"purchase response mismatch: {purchase}")
        status, owned = request("GET", "/me/cosmetics", token)
        if status >= 300:
            raise RuntimeError(f"owned cosmetics failed: HTTP {status} {owned}")
        owned_items = owned.get("items", [])
        if not any(x.get("cosmetic_type") == kind and x.get("asset_key") == key for x in owned_items):
            raise AssertionError(f"purchased {kind} missing from ownership list")
        status, applied = request("POST", "/me/cosmetics/apply", token, {
            "cosmetic_type": kind, "asset_key": key,
        })
        if status >= 300:
            raise RuntimeError(f"{kind} apply failed: HTTP {status} {applied}")
        if applied.get("asset_key") != key or applied.get("cosmetic_type") != kind:
            raise AssertionError(f"apply response mismatch: {applied}")
        print(f"{kind} purchase + ownership + apply OK: {key}")

    exercise(avatar)
    exercise(frame)

    vip_key = vip_asset.get("asset_key")
    vip_status, vip_purchase = request("POST", "/me/cosmetics/purchase", token, {
        "cosmetic_type": vip_asset.get("type"), "asset_key": vip_key,
    })
    if vip_status != 403:
        raise AssertionError(f"VIP purchase must be blocked at VIP 0: HTTP {vip_status} {vip_purchase}")
    vip_status, vip_apply = request("POST", "/me/cosmetics/apply", token, {
        "cosmetic_type": vip_asset.get("type"), "asset_key": vip_key,
    })
    if vip_status != 403:
        raise AssertionError(f"VIP apply must be blocked at VIP 0: HTTP {vip_status} {vip_apply}")
    print(f"VIP level gate OK: {vip_key} requires VIP {vip_asset.get('vip_level')}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"COSMETIC SMOKE FAILED: {exc}", file=sys.stderr)
        raise
