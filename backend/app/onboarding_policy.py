"""Versioned agreement and single-account registration reward policy."""
from datetime import date, datetime
import hashlib
import json
from pathlib import Path
from zoneinfo import ZoneInfo

DOCUMENT = json.loads((Path(__file__).parent/'legal/user-agreement.json').read_text())
DIGEST = hashlib.sha256(json.dumps(DOCUMENT,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()

def agreement():
    return {**DOCUMENT, 'sha256':DIGEST}

def is_adult(value: str, today: date | None = None) -> bool:
    born = date.fromisoformat(value)
    now = today or datetime.now(ZoneInfo('Europe/Istanbul')).date()
    return born <= now and now.year-born.year-((now.month,now.day)<(born.month,born.day)) >= 18

def eligible(items, kind, gender):
    return [item for item in items if item.get('type')==kind and not item.get('vip',False) and item.get('gender') in (gender,None,'unisex')]

def grant_cosmetic(db, model, user_id, kind, key):
    owned = db.query(model).filter(model.user_id==user_id,model.cosmetic_type==kind,model.asset_key==key).first()
    if owned is None:
        db.add(model(user_id=user_id,cosmetic_type=kind,asset_key=key))
