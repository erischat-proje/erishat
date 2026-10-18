from pathlib import Path

def test_referral_safety_hooks():
    root=Path(__file__).resolve().parents[1]
    js=(root/'frontend/referral-lidya.js').read_text()
    api=(root/'backend/app/referral_routes.py').read_text()
    assert 'data-admin type="button" hidden' not in js
    assert 'Referans kodunuzu girin.' in js
    assert "data-a=\"referrals\"" in (root/'frontend/admin-live.js').read_text()
    assert 'window.ErisReferral?.openAdmin?.()' in (root/'frontend/admin-live.js').read_text()
    assert 'Kabul Et' in js and 'Reddet' in js
    assert 'member_users = list(db.scalars(' in api
    assert 'if len(member_users) != len(member_ids)' in api
