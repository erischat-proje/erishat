from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text

from .db import get_db
from .cosmetics import catalog, find_asset, PRICE, VIP_PRICE
from .schemas import CosmeticApply, CosmeticPurchase
from .session import get_user_from_token
from .models import UserCosmetic
from .platform_models import VipStatus, VipRewardClaim
from .wallpapers import catalog as wallpaper_catalog, find as find_wallpaper
from .vip_presentation import presentation_rewards

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


VIP_SPEND_THRESHOLDS = {1: 1_000, 2: 5_000, 3: 15_000, 4: 30_000, 5: 60_000, 6: 120_000, 7: 250_000, 8: 500_000, 9: 1_000_000, 10: 2_000_000, 11: 5_000_000, 12: 10_000_000}

def vip_level(db: Session, user_id: str) -> int:
    row = db.get(VipStatus, user_id)
    return int(row.level) if row else 0


def vip_level_rewards(user) -> list[dict]:
    gender = user.gender if user.gender in {"female", "male"} else None
    by_level: dict[int, list[dict]] = {}
    for item in catalog():
        if not item.get("vip"):
            continue
        if item["type"] == "avatar" and gender and item.get("gender") != gender:
            continue
        by_level.setdefault(int(item["vip_level"]), []).append({
            "cosmetic_type": item["type"], "asset_key": item["asset_key"], "gender": item.get("gender")
        })
    for item in wallpaper_catalog():
        if item["tier"] == "vip":
            by_level.setdefault(item["vip_level"], []).append({
                "cosmetic_type": "wallpaper", "asset_key": item["key"], "asset_url": item["asset"]
            })
    return [{"level": level, "rewards": by_level.get(level, []),
             "presentation_rewards": presentation_rewards(level)} for level in range(1, 13)]


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
    return {"items": [dict(row) for row in rows], "vip_level": vip_level(db, user.id)}


@router.get("/me/appearance-inventory")
def appearance_inventory(user=Depends(current_cosmetic_user), db: Session = Depends(get_db)):
    """One ownership-authoritative inventory for every appearance category."""
    from sqlalchemy import select
    from .models import User
    from .relationship_models import Couple, CoupleRing
    from .relationship_routes import owned_house, ring_asset
    from . import relationship_rewards
    # Serialize inventory repair with purchases/equips; never grant unclaimed VIP levels.
    house = relationship_rewards.house_for(db, user.id)
    if house:
        house = owned_house(db, user.id, lock=True)
        relationship_rewards.ensure_rewards(db, house)
    else:
        db.scalar(select(User).where(User.id == user.id).with_for_update())
    owned = {(r.cosmetic_type, r.asset_key) for r in db.scalars(select(UserCosmetic).where(UserCosmetic.user_id == user.id))}
    claimed = {r.level for r in db.scalars(select(VipRewardClaim).where(VipRewardClaim.user_id == user.id))}
    for level in vip_level_rewards(user):
        if level['level'] not in claimed or level['level'] > vip_level(db, user.id): continue
        for reward in level['rewards']:
            pair = (reward['cosmetic_type'], reward['asset_key'])
            if pair not in owned:
                db.add(UserCosmetic(user_id=user.id, cosmetic_type=pair[0], asset_key=pair[1]))
                owned.add(pair)
    db.flush()
    normal = {(i['type'], i['asset_key']): i for i in catalog()}
    wallpapers = {i['key']: i for i in wallpaper_catalog()}
    result = []
    labels = {'avatar':'Avatar', 'frame':'Çerçeve', 'wallpaper':'Duvar kağıdı', 'bubble':'Sohbet balonu',
              'title':'Ünvan', 'entrance':'Oda girişi', 'ring':'Yüzük', 'relationship_status':'İlişki düzeyi ünvanı'}
    for kind, key in sorted(owned):
        if kind not in labels or kind == 'ring': continue
        relation = key.startswith(relationship_rewards.PREFIX)
        if relation and not house: continue
        item = normal.get((kind, key), {})
        wall = wallpapers.get(key, {}) if kind == 'wallpaper' else {}
        if kind == 'relationship_status':
            status=next((k for k in relationship_rewards.STATUS_NAMES if relationship_rewards.status_asset(k)==key),None)
            if not house or status not in relationship_rewards.status_unlocked(db,house):continue
            result.append({'type':kind,'asset_key':key,'asset':key,'name':relationship_rewards.STATUS_NAMES[status],
                'source':'relationship','level':0,'equip_key':key,
                'equipped':relationship_rewards.status_for(db,house,user.id)==status,
                'compatible':relationship_rewards.status_compatible(house,status)})
            continue
        reward = next((r for r in relationship_rewards.items(user.gender) if r['type'] == kind and r['asset_key'] == key), {}) if relation else {}
        if relation:
            equipped = relationship_rewards.selected(db, user.id, kind) == key
        else:
            equipped = getattr(user, kind + '_asset', None) == key
        result.append({'type':kind, 'asset_key':key, 'asset':wall.get('asset', key),
                       'name':reward.get('name', labels[kind]), 'source':'relationship' if relation else 'vip' if item.get('vip') or wall.get('tier') == 'vip' else 'standard',
                       'level':reward.get('level', item.get('vip_level', wall.get('vip_level', 0))) or 0,
                       'equipped':equipped, 'equip_key':key})
    if house:
        for ring in db.scalars(select(CoupleRing).where(CoupleRing.couple_id == house.id)):
            result.append({'type':'ring', 'asset_key':ring_asset(ring.ring), 'asset':ring_asset(ring.ring),
                           'name':'Yüzük', 'source':'relationship', 'level':0, 'equip_key':ring.ring, 'equipped':house.ring == ring.ring})
    db.commit()
    return {'items':result, 'categories':list(labels), 'vip_level':vip_level(db, user.id)}


@router.get("/me/vip/rewards")
def list_vip_rewards(user=Depends(current_cosmetic_user), db: Session = Depends(get_db)):
    current = vip_level(db, user.id)
    claimed = {int(row.level) for row in db.query(VipRewardClaim).filter(VipRewardClaim.user_id == user.id).all()}
    owned = {(r.cosmetic_type, r.asset_key) for r in db.query(UserCosmetic).filter(UserCosmetic.user_id == user.id)}
    return [{**row, "unlocked": row["level"] <= current, "claimed": row["level"] in claimed,
             "complete": all((r["cosmetic_type"], r["asset_key"]) in owned for r in row["rewards"])}
            for row in vip_level_rewards(user)]


@router.post("/me/vip/rewards/{level}/claim")
def claim_vip_level_rewards(level: int, user=Depends(current_cosmetic_user), db: Session = Depends(get_db)):
    if level < 1 or level > 12:
        raise HTTPException(status_code=404, detail="VIP ödülü bulunamadı")
    db.execute(text("SELECT id FROM users WHERE id=:uid FOR UPDATE"), {"uid": user.id}).first()
    if vip_level(db, user.id) < level:
        raise HTTPException(status_code=403, detail=f"VIP {level} seviyesi gerekli")
    already_claimed = db.get(VipRewardClaim, (user.id, level)) is not None
    rewards = next((item["rewards"] for item in vip_level_rewards(user) if item["level"] == level), [])
    if not already_claimed:
        db.add(VipRewardClaim(user_id=user.id, level=level))
    # Older claims only contained avatars/frames. Repair missing inventory items
    # under the same user lock; never pay currency or duplicate existing rewards.
    for reward in rewards:
        owned = db.query(UserCosmetic.id).filter(
            UserCosmetic.user_id == user.id,
            UserCosmetic.cosmetic_type == reward["cosmetic_type"],
            UserCosmetic.asset_key == reward["asset_key"],
        ).first()
        if not owned:
            db.add(UserCosmetic(user_id=user.id, cosmetic_type=reward["cosmetic_type"], asset_key=reward["asset_key"]))
    db.commit()
    return {"level": level, "claimed": True, "already_claimed": already_claimed, "rewards": rewards,
            "presentation_rewards": presentation_rewards(level)}


@router.post("/me/cosmetics/purchase")
def purchase_cosmetic(payload: CosmeticPurchase, user=Depends(current_cosmetic_user), db: Session = Depends(get_db)):
    kind = payload.cosmetic_type
    key = payload.asset_key
    asset = find_asset(key, kind)
    if not asset:
        raise HTTPException(status_code=404, detail="Görünüm bulunamadı")
    if asset.get('relationship'):raise HTTPException(403,'Bu görünüm ilişki seviyesinde kazanılır.')
    if asset.get("vip"):
        raise HTTPException(status_code=403, detail=f"Bu VIP görünüm mağazadan satın alınamaz; VIP {asset.get('vip_level', 1)} seviyesinde açılır")
    price = int(asset.get("price") or PRICE)

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
    from .vip_spending import record_spend
    vip=record_spend(db,user.id,price,"cosmetic",key)
    db.commit()
    return {"ok": True, "spent": price, "total_spent": vip.total_spent, "level": vip.level, "asset_key": key, "cosmetic_type": kind, "vip": False}


@router.post("/me/cosmetics/apply")
def apply_cosmetic(payload: CosmeticApply, user=Depends(current_cosmetic_user), db: Session = Depends(get_db)):
    kind = payload.cosmetic_type
    key = payload.asset_key
    asset = find_asset(key, kind)
    if not asset:
        raise HTTPException(status_code=404, detail="Görünüm bulunamadı")

    if asset.get("vip"):
        required = int(asset.get("vip_level") or 1)
        current = vip_level(db, user.id)
        if current < required:
            raise HTTPException(status_code=403, detail=f"VIP {required} seviyesi gerekli")
    else:
        owned = db.execute(
            text("SELECT 1 FROM user_cosmetics WHERE user_id=:uid AND cosmetic_type=:kind AND asset_key=:key"),
            {"uid": user.id, "kind": kind, "key": key},
        ).first()
        if not owned:
            raise HTTPException(status_code=403, detail="Önce bu görünümü satın almalısınız")

    if asset.get('relationship'):
        from .relationship_rewards import house_for, items
        house=house_for(db,user.id)
        if not house or not any(r['asset_key']==key and r['level']<=house.level for r in items(user.gender)):
            raise HTTPException(403,'Aktif ilişki ödülü gerekli.')
    column = "avatar_asset" if kind == "avatar" else "frame_asset" if kind == "frame" else None
    if not column:
        raise HTTPException(status_code=400, detail="Geçersiz görünüm türü")

    db.execute(text(f"UPDATE users SET {column}=:key WHERE id=:uid"), {"key": key, "uid": user.id})
    db.commit()
    return {"ok": True, "cosmetic_type": kind, "asset_key": key, "vip": bool(asset.get("vip")), "vip_level": asset.get("vip_level")}


@router.get("/wallpapers")
def list_wallpapers():
    return {"items": wallpaper_catalog()}


@router.get("/me/wallpaper")
def current_wallpaper(user=Depends(current_cosmetic_user)):
    return {"asset_key": user.wallpaper_asset}


@router.post("/me/wallpaper/purchase")
def purchase_wallpaper(payload: dict, user=Depends(current_cosmetic_user), db: Session = Depends(get_db)):
    key = str(payload.get("asset_key") or "").strip()
    item = find_wallpaper(key)
    if not item:
        raise HTTPException(status_code=404, detail="Duvar kağıdı bulunamadı")
    if item['tier']=='relationship':raise HTTPException(403,'Bu duvar kağıdı ilişki seviyesinde kazanılır.')
    if item["tier"] == "vip":
        raise HTTPException(status_code=403, detail=f"Bu duvar kağıdı VIP {item['vip_level']} seviyesinde açılır")
    price = int(item["price"])
    locked = db.execute(text("SELECT lidya FROM users WHERE id=:uid FOR UPDATE"), {"uid": user.id}).first()
    if not locked or int(locked[0]) < price:
        raise HTTPException(status_code=400, detail="Yeterli Lidya yok")
    owned = db.execute(text("SELECT 1 FROM user_cosmetics WHERE user_id=:uid AND cosmetic_type='wallpaper' AND asset_key=:key"), {"uid": user.id, "key": key}).first()
    if owned:
        raise HTTPException(status_code=409, detail="Bu duvar kağıdı zaten satın alınmış")
    db.execute(text("UPDATE users SET lidya=lidya-:price WHERE id=:uid"), {"price": price, "uid": user.id})
    db.execute(text("INSERT INTO user_cosmetics (user_id, cosmetic_type, asset_key) VALUES (:uid,'wallpaper',:key)"), {"uid": user.id, "key": key})
    db.commit()
    return {"ok": True, "asset_key": key, "spent": price}


@router.post("/me/vip/claims/wallpaper")
def claim_vip_wallpaper(user=Depends(current_cosmetic_user), db: Session = Depends(get_db)):
    db.execute(text("SELECT id FROM users WHERE id=:uid FOR UPDATE"), {"uid": user.id}).first()
    current = vip_level(db, user.id)
    if current < 10:
        raise HTTPException(status_code=403, detail="VIP 10 seviyesi gerekli")
    vip = db.get(VipStatus, user.id)
    if not vip:
        vip = VipStatus(user_id=user.id, level=current, total_spent=0)
        db.add(vip)
        db.flush()
    if vip.wallpaper_claimed:
        return {"ok": True, "claimed": True, "asset_key": "vip_wallpaper_10", "vip_level": current, "already_claimed": True}
    owned = db.execute(text("SELECT 1 FROM user_cosmetics WHERE user_id=:uid AND cosmetic_type='wallpaper' AND asset_key='vip_wallpaper_10'"), {"uid": user.id}).first()
    if not owned:
        db.execute(text("INSERT INTO user_cosmetics (user_id, cosmetic_type, asset_key) VALUES (:uid,'wallpaper','vip_wallpaper_10')"), {"uid": user.id})
    vip.wallpaper_claimed = True
    db.commit()
    return {"ok": True, "claimed": True, "asset_key": "vip_wallpaper_10", "vip_level": current, "already_claimed": False}


@router.post("/me/wallpaper/apply")
def apply_wallpaper(payload: dict, user=Depends(current_cosmetic_user), db: Session = Depends(get_db)):
    key = str(payload.get("asset_key") or "").strip()
    item = find_wallpaper(key)
    if not item:
        raise HTTPException(status_code=404, detail="Duvar kağıdı bulunamadı")
    if item['tier']=='relationship':
        from .relationship_rewards import selected
        if selected(db,user.id,'wallpaper')!=item['asset']:raise HTTPException(403,'Aktif ilişki duvar kağıdı gerekli.')
    if item["tier"] == "vip":
        current = vip_level(db, user.id)
        required = int(item["vip_level"])
        if current < required:
            raise HTTPException(status_code=403, detail=f"VIP {required} seviyesi gerekli")
    else:
        owned = db.execute(text("SELECT 1 FROM user_cosmetics WHERE user_id=:uid AND cosmetic_type='wallpaper' AND asset_key=:key"), {"uid": user.id, "key": item["asset"] if item["tier"]=="relationship" else key}).first()
        if not owned:
            raise HTTPException(status_code=403, detail="Önce bu duvar kağıdını satın almalısınız")
    db.execute(text("UPDATE users SET wallpaper_asset=:key WHERE id=:uid"), {"key": key, "uid": user.id})
    db.commit()
    return {"ok": True, "asset_key": key, "tier": item["tier"], "vip_level": item["vip_level"]}
