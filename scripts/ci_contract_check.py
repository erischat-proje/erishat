from pathlib import Path

workflow = Path('.github/workflows/quality.yml').read_text(encoding='utf-8')
required = [
    'live-e2e:',
    'scripts/room_live_smoke.py',
    'scripts/room_ban_live_smoke.py',
    'scripts/dm_live_smoke.py',
    'scripts/cosmetic_live_smoke.py',
    'ERISCHAT_SMOKE_BASE_URL: http://127.0.0.1:8000',
    'DATABASE_URL: postgresql+psycopg://erischat:erischat@127.0.0.1:5432/erischat',
]
missing = [item for item in required if item not in workflow]
if missing:
    raise SystemExit('quality.yml missing required live-e2e contract: ' + ', '.join(missing))

for path in [
    'scripts/room_live_smoke.py',
    'scripts/room_ban_live_smoke.py',
    'scripts/dm_live_smoke.py',
    'scripts/cosmetic_live_smoke.py',
]:
    if not Path(path).is_file():
        raise SystemExit(f'missing smoke harness: {path}')

print('CI live-e2e contract OK')
