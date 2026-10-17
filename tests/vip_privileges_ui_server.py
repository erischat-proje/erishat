"""Isolated browser-test server, real rewards API and SQLite persistence."""

import runpy
from pathlib import Path
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

root = Path(__file__).resolve().parents[1]
case = runpy.run_path(str(root / "tests/test_vip_privileges.py"))["Benefits"]()
case.setUp()
from app import cosmetic_routes

app = case.client.app
app.include_router(cosmetic_routes.router)


@app.get("/v1/me/vip")
def status():
    return {"level": 12, "total_spent": 10000000, "entry_style": "male"}


@app.get("/")
def index():
    return HTMLResponse(
        """<!doctype html><html lang="tr" data-theme="light"><head><base href="/frontend/"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--ui-panel:#fbf5e8;--ui-raised:#fffaf1;--ui-ink:#36291b;--ui-muted:#74634f;--ui-line:#d0b77b77;--ui-gold:#946618;--ui-button:#b28c38;--ui-overlay:#261b0cd9}html[data-theme=dark]{--ui-panel:#1c1711;--ui-raised:#292117;--ui-ink:#f5e9d1;--ui-muted:#beac8b;--ui-gold:#e5c77f}body{margin:0;background:var(--ui-panel);color:var(--ui-ink);font-family:Arial,sans-serif}button{cursor:pointer}</style><link rel="stylesheet" href="/frontend/vip-privileges.css"></head><body><button id="open">VIP merkezini aç</button><div id="profile"><div class="profile card"><div class="name"><h2>Kaan</h2></div></div></div><script>window.ERIS_API='/v1';window.ErisApiTransport={poll(){}};window.toast=()=>{};window.ErisChatCosmetics={assetUrl:k=>'/frontend/'+k};window.ErisVIPDesigns={get:()=>null};localStorage.setItem('token','test')</script><script src="/frontend/vip-privileges.js"></script><script src="/frontend/vip-rewards-live.js"></script><script>document.getElementById('open').onclick=()=>ErisChatVIP.open()</script></body></html>"""
    )


app.mount("/frontend", StaticFiles(directory=root / "frontend"), name="frontend")
