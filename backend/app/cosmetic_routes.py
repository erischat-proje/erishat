from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from .db import get_db
from .cosmetics import catalog, find_asset, PRICE

router = APIRouter(prefix="/v1", tags=["cosmetics"])


def _user_id_from_request(request):
    user_id = request.headers.get("X-User-Id")
    if not user_id:
        raise HTTPException(401, "Oturum gerekli")
    return user_id


@router.get("/cosmetics")
def list_cosmetics(kind: str | None = None, gender: str | None = None):
    items = catalog()
    if kind:
        items = [x for x in items if x["type"] == kind]
    if gender:
        items = [x for x in items if x["gender"] in (None, gender)]
    return {"items": items, "price": PRICE}


@router.get("/me/cosmetics")
def owned_cosmetics(request, db: Session = Depends(get_db)):
    user_id = _user_id_from_request(request)
    rows = db.execute(text("SELECT cosmetic_type, asset_key FROM user_cosmetics WHERE user_id=:uid ORDER BY id"), {"uid": user_id}).mappings().all()
    return {"items": [dict(row) for row in rows]}


@router.post("/me/cosmetics/purchase")
def purchase_cosmetic(payload: dict, request, db: Session = Depends(get_db)):
    user_id = _user_id_from_request(request)
    kind = payload.get("cosmetic_type")
    key = payload.get("asset_key")
    item = find_asset(key, kind) if isinstance(key, str) and isinstance(kind, str) else None
    if not item:
        raise HTTPException(404, "Görünüm bulunamadı")
    exists = db.execute(text("SELECT 1 FROM user_cosmetics WHERE user_id=:uid AND cosmetic_type=:kind AND asset_key=:key"), {"uid": user_id, "kind": kind, "key": key}).first()
    if exists:
        raise HTTPException(409, "Bu görünüm zaten satın alınmış")
    user = db.execute(text("SELECT lidya FROM users WHERE id=:uid FOR UPDATE"), {"uid": user_id}).first()
    if not user:
        raise HTTPException(404, "Kullanıcı bulunamadı")
    if int(user[0]) < PRICE:
        raise HTTPException(400, "Yeterli Lidya yok")
    db.execute(text("UPDATE users SET lidya=lidya-:price WHERE id=:uid"), {"price": PRICE, "uid": user_id})
    db.execute(text("INSERT INTO user_cosmetics (user_id, cosmetic_type, asset_key) VALUES (:uid,:kind,:key)"), {"uid": user_id, "kind": kind, "key": key})
    db.commit()
    return {"ok": True, "spent": PRICE, "asset_key": key, "cosmetic_type": kind}


@router.post("/me/cosmetics/apply")
def apply_cosmetic(payload: dict, request, db: Session = Depends(get_db)):
    user_id = _user_id_from_request(request)
    kind = payload.get("cosmetic_type")
    key = payload.get("asset_key")
    if not find_asset(key, kind):
        raise HTTPException(404, "Görünüm bulunamadı")
    owned = db.execute(text("SELECT 1 FROM user_cosmetics WHERE user_id=:uid AND cosmetic_type=:kind AND asset_key=:key"), {"uid": user_id, "kind": kind, "key": key}).first()
    if not owned:
        raise HTTPException(403, "Önce bu görünümü satın almalısınız")
    column = "avatar_asset" if kind == "avatar" else "frame_asset" if kind == "frame" else None
    if not column:
        raise HTTPException(400, "Geçersiz görünüm türü")
    db.execute(text(f"UPDATE users SET {column}=:key WHERE id=:uid"), {"key": key, "uid": user_id})
    db.commit()
    return {"ok": True, "cosmetic_type": kind, "asset_key": key}
