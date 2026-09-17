from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text

from .db import get_db
from .cosmetics import catalog, find_asset, PRICE, VIP_PRICE
from .schemas import CosmeticApply, CosmeticPurchase
from .session import get_user_from_token

router = APIRouter(prefix="/v1", tags=["cosmetics"])


def current_cosmetic_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Bearer token gerekli")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Bearer token gerekli")
    user = get_user_from_token(db, token)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Geçersiz veya süresi dolmuş oturum")
    return user


@router.get("/cosmetics")
def list_cosmetics(kind: str | None = None, gender: str | None = None):
    items = catalog()
    if kind:
        items = [item for item in items if item["type"] == kind]
    if gender:
        items = [item for item in items if item["gender"] in (None, gender)]
    return {"items": items, "price": PRICE, "vip_price": VIP_PRICE}


@router.get("/me/cosmetics")
def owned_cosmetics(user=Depends(current_cosmetic_user), db: Session = Depends(get_db)):
    rows = db.execute(
        text("SELECT cosmetic_type, asset_key FROM user_cosmetics WHERE user_id=:uid ORDER BY id"),
        {"uid": user.id},
    ).mappings().all()
    return {"items": [dict(row) for row in rows]}


@router.post("/me/cosmetics/purchase")
def purchase_cosmetic(payload: CosmeticPurchase, user=Depends(current_cosmetic_user), db: Session = Depends(get_db)):
    kind = payload.cosmetic_type
    key = payload.asset_key
    asset = find_asset(key, kind)
    if not asset:
        raise HTTPException(status_code=404, detail="Görünüm bulunamadı")
    price = int(asset.get("price") or (VIP_PRICE if asset.get("vip") else PRICE))

    # Lock the balance row before checking ownership/balance so concurrent purchases
    # cannot spend the same Lidya twice or race the unique cosmetic constraint.
    locked_user = db.execute(
        text("SELECT lidya FROM users WHERE id=:uid FOR UPDATE"),
        {"uid": user.id},
    ).first()
    if not locked_user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")

    exists = db.execute(
        text("SELECT 1 FROM user_cosmetics WHERE user_id=:uid AND cosmetic_type=:kind AND asset_key=:key"),
        {"uid": user.id, "kind": kind, "key": key},
    ).first()
    if exists:
        raise HTTPException(status_code=409, detail="Bu görünüm zaten satın alınmış")
    if int(locked_user[0]) < price:
        raise HTTPException(status_code=400, detail="Yeterli Lidya yok")

    db.execute(text("UPDATE users SET lidya=lidya-:price WHERE id=:uid"), {"price": price, "uid": user.id})
    db.execute(
        text("INSERT INTO user_cosmetics (user_id, cosmetic_type, asset_key) VALUES (:uid,:kind,:key)"),
        {"uid": user.id, "kind": kind, "key": key},
    )
    db.commit()
    return {"ok": True, "spent": price, "asset_key": key, "cosmetic_type": kind, "vip": bool(asset.get("vip"))}


@router.post("/me/cosmetics/apply")
def apply_cosmetic(payload: CosmeticApply, user=Depends(current_cosmetic_user), db: Session = Depends(get_db)):
    kind = payload.cosmetic_type
    key = payload.asset_key
    asset = find_asset(key, kind)
    if not asset:
        raise HTTPException(status_code=404, detail="Görünüm bulunamadı")

    owned = db.execute(
        text("SELECT 1 FROM user_cosmetics WHERE user_id=:uid AND cosmetic_type=:kind AND asset_key=:key"),
        {"uid": user.id, "kind": kind, "key": key},
    ).first()
    if not owned:
        raise HTTPException(status_code=403, detail="Önce bu görünümü satın almalısınız")

    column = "avatar_asset" if kind == "avatar" else "frame_asset" if kind == "frame" else None
    if not column:
        raise HTTPException(status_code=400, detail="Geçersiz görünüm türü")

    db.execute(text(f"UPDATE users SET {column}=:key WHERE id=:uid"), {"key": key, "uid": user.id})
    db.commit()
    return {"ok": True, "cosmetic_type": kind, "asset_key": key, "vip": bool(asset.get("vip"))}
