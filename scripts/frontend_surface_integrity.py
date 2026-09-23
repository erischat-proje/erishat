#!/usr/bin/env python3
from pathlib import Path
import re

html = Path("frontend/erischat-main.html").read_text(encoding="utf-8")

required_views = {"home","messages","explore","profile","shop","vip","anon","search"}
views = set(re.findall(r'<section id="([^"]+)" class="view', html))
missing = sorted(required_views - views)
if missing:
    raise SystemExit(f"FRONTEND_SURFACE_FAIL missing_views={','.join(missing)}")

required_ids = {"realRooms","rooms","people","events","realRoomModal","realRoomSeats","realRoomChat","chat","chatBody","chatInput"}
ids = set(re.findall(r'id="([^"]+)"', html))
missing_ids = sorted(required_ids - ids)
if missing_ids:
    raise SystemExit(f"FRONTEND_SURFACE_FAIL missing_ids={','.join(missing_ids)}")

scripts = [re.sub(r"\?.*$", "", x) for x in re.findall(r'<script[^>]+src=["\']([^"\']+)["\']', html)]
dupes = sorted({x for x in scripts if scripts.count(x) > 1})
if dupes:
    raise SystemExit("FRONTEND_SURFACE_FAIL duplicate_scripts=" + ",".join(dupes))

for asset in {"./platform.js","./gift-live.js","./room-live.js"}:
    if asset not in scripts:
        raise SystemExit(f"FRONTEND_SURFACE_FAIL missing_script={asset}")

for marker in ("showView('shop')","showView('vip')","showView('profile')","showView('explore')"):
    if marker not in html:
        raise SystemExit(f"FRONTEND_SURFACE_FAIL missing_navigation={marker}")

print(f"FRONTEND_SURFACE_PASS views={len(required_views)} ids={len(required_ids)} scripts={len(scripts)}")
