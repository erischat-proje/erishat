"""Lidya benefits: server-authoritative entitlements, selections and periodic rewards."""

import json
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from sqlalchemy import select
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from .db import Base, get_db
from .models import User, UserCosmetic
from .platform_models import VipStatus, UserPrivacy, UserBlock
from .cosmetic_routes import current_cosmetic_user

from .vip_benefit_models import VipBenefitState, VipBenefitReceipt, VipBenefitLease

COUPON = (0, 0, 0, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15)
ASSETS = "assets/vip-privileges-v1/"
NAMES = (
    "Altın Dokunuş",
    "Kehribar",
    "İnci Sarayı",
    "Safir Taht",
    "Zümrüt Hanedan",
    "Yakut Asalet",
    "Elmas Saray",
    "Hanedan Bağı",
    "Hazine Muhafızı",
    "Lidya Hükümdarı",
    "İmparatorluk",
    "Lidya Efsanesi",
)
# All options are allowlisted identifiers, never client CSS/URLs/HTML.
SPECS = [
    (
        "name_gold",
        1,
        "Altın isim",
        "profile",
        "Altın isim rengi profilinde ve oda sohbetinde görünür.",
        ("gold", "champagne"),
    ),
    (
        "stickers",
        1,
        "Lidya çıkartmaları",
        "chat",
        "VIP merkezinden veya oda emoji menüsünden gönder; VIP 2’de 12 çıkartmaya ulaşır.",
        ("enabled",),
    ),
    (
        "crest",
        1,
        "Lidya arması",
        "profile",
        "Profilinde altın aslan mührü göster.",
        ("lion",),
    ),
    (
        "status",
        2,
        "İşlemeli durum yazısı",
        "profile",
        "Profilinde durum yazını üç Lidya düzeninden biriyle göster.",
        ("seal", "marble", "gold"),
    ),
    (
        "favorites",
        2,
        "Favori odalar",
        "rooms",
        "VIP merkezinde 30 odaya kadar kişisel favori listeni yönet.",
        (),
    ),
    (
        "weekly_trial",
        2,
        "Haftalık deneme kartı",
        "rewards",
        "Her hafta bir kez seçtiğin profil sahnesini 24 saat dene.",
        (),
    ),
    (
        "cover",
        3,
        "Animasyonlu profil kapağı",
        "profile",
        "Sardis, Paktolos ve Saray kapaklarından birini seç.",
        ("sardis", "paktolos", "palace"),
    ),
    (
        "aura",
        3,
        "Profil ışığı",
        "profile",
        "Altın parıltı veya inci ışığını aç; hareket azaltma ayarına uyar.",
        ("gold", "pearl"),
    ),
    (
        "gallery",
        3,
        "Fotoğraf vitrini",
        "profile",
        "Herkese açık kendi Keşfet fotoğraflarından üç tanesini sergile.",
        (),
    ),
    (
        "coupon",
        3,
        "Aylık mağaza kuponu",
        "shop",
        "Açıldığında sonraki uygun kozmetik alışverişinde otomatik uygulanır. Ayda bir; mevcut ayın en yüksek oranı kullanılır.",
        ("enabled",),
    ),
    (
        "welcome",
        4,
        "Giriş mesajı",
        "entry",
        "Odaya girişinde en fazla 80 karakterlik kişisel mesajını göster.",
        ("enabled",),
    ),
    (
        "entry_sound",
        4,
        "Giriş sesi",
        "entry",
        "İki kısa Lidya karşılama melodisinden birini seç. Dinleyenler sesleri kapatabilir.",
        ("harp", "chime"),
    ),
    (
        "particles",
        4,
        "Altın giriş parçacıkları",
        "entry",
        "Giriş kartına defne veya altın tozu efekti ekle.",
        ("laurel", "dust"),
    ),
    (
        "gift_seal",
        4,
        "Hediye mührü",
        "gifts",
        "Odalarda gönderdiğin hediyelerde Lidya mührünü göster.",
        ("lion", "laurel"),
    ),
    (
        "weekly_box",
        5,
        "Haftalık seçim sandığı",
        "rewards",
        "Her hafta bir profil sahnesini 3 günlüğüne seç; para veya rastgele ödül içermez.",
        (),
    ),
    (
        "gift_motion",
        5,
        "Özel hediye animasyonları",
        "gifts",
        "Altın yağmuru, defne ve saray ışığı arasından seç.",
        ("rain", "laurel", "palace"),
    ),
    (
        "gift_favorites",
        5,
        "Favori hediyeler",
        "gifts",
        "Hediye menüsündeki favorilerini bu merkezden yönet ve öne çıkar.",
        (),
    ),
    (
        "monthly_trial",
        5,
        "Aylık kozmetik kartı",
        "rewards",
        "Her ay bir profil sahnesini 3 günlüğüne dene. VIP 9: 7, VIP 11: 15, VIP 12: 30 gün.",
        (),
    ),
    (
        "showcase",
        6,
        "Koleksiyon vitrini",
        "profile",
        "Sahip olduğun kozmetikleri sergile. VIP 6: 3, VIP 9: 6, VIP 11: 9 ürün.",
        (),
    ),
    (
        "cover_pack",
        6,
        "Hanedan kapak paketi",
        "profile",
        "Altın Paktolos ve Gece Sarayı animasyonlu kapaklarını kullan.",
        ("paktolos_gold", "palace_night"),
    ),
    (
        "info_panel",
        6,
        "Mermer bilgi panosu",
        "profile",
        "Profil bilgilerini altın işlemeli açık veya koyu mermer panelde sun.",
        ("ivory", "onyx"),
    ),
    (
        "room_decor",
        7,
        "Lidya oda dekorları",
        "rooms",
        "Sahibi olduğun odalarda Sardis veya Saray dekorunu seç.",
        ("sardis", "palace"),
    ),
    (
        "seat_skin",
        7,
        "Koltuk ve mikrofon kaplaması",
        "rooms",
        "Kendi odalarında altın ve inci koltuk çerçeveleri kullan.",
        ("gold", "pearl"),
    ),
    (
        "room_board",
        7,
        "Oda duyuru panosu",
        "rooms",
        "Kendi odanın üstünde en fazla 120 karakterlik duyurunu göster.",
        ("enabled",),
    ),
    (
        "room_crest",
        7,
        "Oda arması",
        "rooms",
        "Kendi odanın logosunda altın aslan veya defne arması göster.",
        ("lion", "laurel"),
    ),
    (
        "home_decor",
        8,
        "İlişki evi / kişisel dekor",
        "profile",
        "İlişki vitrini veya kişisel profilinde saray dekoru kullan; ilişki zorunlu değil.",
        ("personal", "couple"),
    ),
    (
        "duo_entry",
        8,
        "Birlikte giriş efekti",
        "entry",
        "Aktif ilişkindeki eşin odadaysa ortak giriş mührünü göster.",
        ("enabled",),
    ),
    (
        "shared_gallery",
        8,
        "Ortak fotoğraf vitrini",
        "profile",
        "İkiniz de açarsanız iki eşin seçtiği herkese açık fotoğrafları ortak vitrinde göster.",
        ("enabled",),
    ),
    (
        "friend_pass",
        8,
        "Arkadaşa deneme kartı",
        "rewards",
        "Arkadaşının 12 haneli ID’sini doğrulayarak 3 günlük profil sahnesi gönder. Aylık limit: 2; VIP 10: 3; VIP 12: 5.",
        (),
    ),
    (
        "scenes",
        9,
        "Özel profil sahneleri",
        "profile",
        "Altın Aslan ve Saray sahneleri profilinde görünür.",
        ("lion", "palace"),
    ),
    (
        "early_access",
        9,
        "Koleksiyon önizlemesi",
        "collection",
        "Merkezdeki yeni Lidya tasarımlarını ve erken deneme seçeneklerini incele.",
        (),
    ),
    (
        "throne",
        10,
        "Hareketli taht sahnesi",
        "profile",
        "Altın taht arka planı ve zarif ışık hareketini etkinleştir.",
        ("enabled",),
    ),
    (
        "palace_room",
        10,
        "Saray oda dekoru",
        "rooms",
        "Kendi odalarında tam genişlik saray görünümünü aç.",
        ("enabled",),
    ),
    (
        "entry_card",
        10,
        "Kişisel giriş kartı",
        "entry",
        "Giriş mesajını kraliyet kartında göster.",
        ("enabled",),
    ),
    (
        "vote",
        11,
        "Koleksiyon oylaması",
        "collection",
        "Aktif ay için gelecek koleksiyonun temasına oy ver. Ay içinde oyun değiştirilebilir.",
        (),
    ),
    (
        "gift_scene",
        11,
        "Hediye sunum sahnesi",
        "gifts",
        "Hediye animasyonunun arkasına kısa saray sahnesi ekle.",
        ("enabled",),
    ),
    (
        "royal_scene",
        12,
        "Kraliyet profil sahnesi",
        "profile",
        "Tam kraliyet profili, taç ve saray arka planını etkinleştir.",
        ("enabled",),
    ),
    (
        "cinematic",
        12,
        "Geçilebilir giriş sinematiği",
        "entry",
        "Kısa kraliyet girişini aç. Her izleyici tek dokunuşla geçebilir.",
        ("enabled",),
    ),
    (
        "crown_name",
        12,
        "Taçlı isim",
        "profile",
        "Altın isminin yanında Lidya tacını göster.",
        ("enabled",),
    ),
    (
        "royal_room",
        12,
        "Kraliyet oda seti",
        "rooms",
        "Saray dekoru, altın koltuklar ve oda armasını tek dokunuşta etkinleştir.",
        ("enabled",),
    ),
    (
        "priority_support",
        12,
        "Öncelikli destek",
        "support",
        "Yeni destek taleplerin bekleyen talepler arasında öncelikli sıralanır; yetkili rolü vermez.",
        (),
    ),
]
SPEC = {s[0]: s for s in SPECS}
TRIALS = {
    "trial-sardis": "Sardis Işığı",
    "trial-paktolos": "Paktolos Mermeri",
    "trial-palace": "Kraliyet Sarayı",
}


def now():
    return datetime.now(timezone.utc)


def utc(d):
    return d.replace(tzinfo=timezone.utc) if d.tzinfo is None else d


def period(kind, at=None):
    d = (at or now()).astimezone(ZoneInfo("Europe/Istanbul"))
    return (
        d.date().isoformat()
        if kind == "daily"
        else (
            f"{d.isocalendar().year}-W{d.isocalendar().week:02}"
            if kind.startswith("weekly")
            else d.strftime("%Y-%m")
        )
    )


def level(db, uid):
    from .vip_membership import sync

    sync(db, uid)
    row = db.get(VipStatus, uid)
    return max(0, min(12, int(row.level or 0))) if row else 0


def state(db, uid):
    return db.get(VipBenefitState, uid)


def values(db, uid):
    row = state(db, uid)
    return json.loads(row.selections) if row else {}


def locked(db, user):
    db.scalar(select(User.id).where(User.id == user.id).with_for_update())
    row = state(db, user.id)
    if row is None:
        row = VipBenefitState(user_id=user.id, points=0, selections="{}")
        db.add(row)
        db.flush()
    else:
        db.refresh(row)
    return row


def save(row, data):
    row.selections = json.dumps(data, ensure_ascii=False)


def require(db, uid, key):
    if key not in SPEC:
        raise HTTPException(404, "VIP ayrıcalığı bulunamadı.")
    if level(db, uid) < SPEC[key][1]:
        raise HTTPException(403, f"VIP {SPEC[key][1]} gerekli.")


def receipt_key(kind):
    return f"{kind}:{period(kind)}"


def claimed(db, uid, kind):
    return db.get(VipBenefitReceipt, (uid, receipt_key(kind))) is not None


def trial_days(lvl):
    return 30 if lvl >= 12 else 15 if lvl >= 11 else 7 if lvl >= 9 else 3


def friend_limit(lvl):
    return 5 if lvl >= 12 else 3 if lvl >= 10 else 2 if lvl >= 8 else 0


def capacity(lvl):
    return 9 if lvl >= 11 else 6 if lvl >= 9 else 3 if lvl >= 6 else 0


def active(db, uid):
    lvl = level(db, uid)
    data = values(db, uid)
    result = {
        k: v
        for k, v in data.items()
        if k in SPEC and SPEC[k][1] <= lvl and v and SPEC[k][5] and v in SPEC[k][5]
    }
    result.update(
        {k: str(data.get(k, "")) for k in ("status_text", "welcome_text", "board_text")}
    )
    if lvl < 2:
        result.pop("status_text", None)
    if lvl < 4:
        result.pop("welcome_text", None)
    if lvl < 7:
        result.pop("board_text", None)
    at = now()
    leases = list(
        db.scalars(select(VipBenefitLease).where(VipBenefitLease.user_id == uid))
    )
    valid = {
        r.item: utc(r.expires_at).isoformat() for r in leases if utc(r.expires_at) > at
    }
    if data.get("trial_scene") in valid:
        result["trial_scene"] = data["trial_scene"]
        result["trial_expires_at"] = valid[data["trial_scene"]]
    from .vip_level_rewards import resolve

    user = db.get(User, uid)
    if user:
        result.update(resolve(user, lvl, data))
    return result


def profile(db, user):
    privacy = db.get(UserPrivacy, user.id)
    if privacy and (privacy.hide_vip or privacy.hide_vip_neon):
        return {}
    data = values(db, user.id)
    lvl = level(db, user.id)
    out = active(db, user.id)
    owned = {
        (r.cosmetic_type, r.asset_key)
        for r in db.scalars(select(UserCosmetic).where(UserCosmetic.user_id == user.id))
    }
    out["showcase"] = [
        x for x in data.get("showcase", []) if (x["type"], x["key"]) in owned
    ][: capacity(lvl)]
    from .platform_models import SocialPost

    ids = data.get("gallery", []) if lvl >= 3 else []
    posts = (
        list(
            db.scalars(
                select(SocialPost.id).where(
                    SocialPost.id.in_(ids),
                    SocialPost.user_id == user.id,
                    SocialPost.audience == "public",
                    SocialPost.is_hidden.is_(False),
                )
            )
        )
        if ids
        else []
    )
    out["gallery"] = posts[:3]
    if out.get("shared_gallery"):
        from .relationship_models import Couple, CoupleMember

        member = db.get(CoupleMember, user.id)
        house = db.get(Couple, member.couple_id) if member else None
        if house and house.active:
            partner = house.female_id if house.male_id == user.id else house.male_id
            if active(db, partner).get("shared_gallery"):
                ids = values(db, partner).get("gallery", [])
                extra = (
                    list(
                        db.scalars(
                            select(SocialPost.id).where(
                                SocialPost.id.in_(ids),
                                SocialPost.user_id == partner,
                                SocialPost.audience == "public",
                                SocialPost.is_hidden.is_(False),
                            )
                        )
                    )
                    if ids
                    else []
                )
                out["gallery"] += extra[:3]
    return out


def room_style(db, room):
    data = active(db, room.owner_id)
    from .relationship_models import Couple, CoupleRoom

    link = db.scalar(select(CoupleRoom).where(CoupleRoom.room_id == room.id))
    house = db.get(Couple, link.couple_id) if link else None
    if house and house.active:
        for uid in (house.male_id, house.female_id):
            partner_style = active(db, uid)
            if partner_style.get("home_decor") == "couple":
                data["room_decor"] = "palace"
                if partner_style.get("level_home_decor"):
                    data["level_room_decor"] = partner_style["level_home_decor"]
                break
    return {
        k: v
        for k, v in data.items()
        if k
        in (
            "room_decor",
            "seat_skin",
            "room_board",
            "room_crest",
            "palace_room",
            "royal_room",
            "board_text",
            "level_room_decor",
        )
    }


def entry_style(db, uid):
    p = db.get(UserPrivacy, uid)
    if p and (p.hide_vip or p.hide_vip_entry):
        return {}
    data = active(db, uid)
    return {
        k: v
        for k, v in data.items()
        if k
        in (
            "welcome",
            "welcome_text",
            "entry_sound",
            "particles",
            "duo_entry",
            "entry_card",
            "cinematic",
            "level_entry_frame",
        )
    }


def name_style(db, uid):
    privacy = db.get(UserPrivacy, uid)
    if privacy and (privacy.hide_vip or privacy.hide_vip_neon):
        return {}
    lvl = level(db, uid)
    data = values(db, uid)
    return {
        key: data[key]
        for key in ("name_gold", "crown_name")
        if key in data and SPEC[key][1] <= lvl and data[key] in SPEC[key][5]
    }


def gift_style(db, uid):
    p = db.get(UserPrivacy, uid)
    if p and p.hide_vip:
        return {}
    return {
        k: v
        for k, v in active(db, uid).items()
        if k in ("gift_seal", "gift_motion", "gift_scene", "level_gift_seal")
    }


def coupon_price(db, uid, price, consume=False):
    pct = COUPON[level(db, uid)]
    if (
        not pct
        or active(db, uid).get("coupon") != "enabled"
        or claimed(db, uid, "coupon")
    ):
        return price
    discounted = max(1, price - (price * pct // 100))
    if consume and discounted < price:
        db.add(
            VipBenefitReceipt(
                user_id=uid,
                key=receipt_key("coupon"),
                amount=price - discounted,
                created_at=now(),
            )
        )
    return discounted


router = APIRouter(prefix="/v1", tags=["vip-privileges"])


class Selection(BaseModel):
    key: str = Field(max_length=40)
    value: str | None = Field(default=None, max_length=120)


class TrialRequest(BaseModel):
    item: str = Field(default="trial-palace", max_length=80)


class FriendRequest(TrialRequest):
    public_id: str = Field(pattern=r"^\d{12}$")


class ShowcaseRequest(BaseModel):
    items: list[dict[str, str]] = Field(max_length=9)


class GalleryRequest(BaseModel):
    post_ids: list[int] = Field(max_length=3)


class FavoriteRequest(BaseModel):
    ids: list[str] = Field(max_length=30)


@router.get("/me/vip/benefits")
def benefits(user=Depends(current_cosmetic_user), db=Depends(get_db)):
    lvl = level(db, user.id)
    data = values(db, user.id)
    row = state(db, user.id)
    receipts = {
        r.key
        for r in db.scalars(
            select(VipBenefitReceipt).where(VipBenefitReceipt.user_id == user.id)
        )
    }
    from .vip_level_rewards import catalog as level_catalog
    from .vip_membership import status_view

    result = {
        "level": lvl,
        "reward_basis": "vip_level",
        "level_rewards": level_catalog(user, lvl, data),
        "membership": status_view(db, user.id),
        "coupon_percent": COUPON[lvl],
        "timezone": "Europe/Istanbul",
        "period": period("monthly"),
        "showcase_capacity": capacity(lvl),
        "friend_limit": friend_limit(lvl),
        "friend_used": sum(
            k.startswith("friend:" + period("monthly") + ":") for k in receipts
        ),
        "selections": data,
        "active": active(db, user.id),
        "period_claimed": {
            k: receipt_key(k) in receipts
            for k in ("weekly_trial", "weekly_box", "monthly_trial", "coupon")
        },
        "trials": [
            {
                "item": r.item,
                "name": TRIALS.get(r.item, r.item),
                "expires_at": utc(r.expires_at).isoformat(),
                "active": utc(r.expires_at) > now(),
            }
            for r in db.scalars(
                select(VipBenefitLease).where(VipBenefitLease.user_id == user.id)
            )
        ],
        "trial_options": [{"id": k, "name": v} for k, v in TRIALS.items()],
        "levels": [
            {
                "level": n,
                "name": NAMES[n - 1],
                "coupon_percent": COUPON[n],
            }
            for n in range(1, 13)
        ],
        "items": [
            {
                "id": s[0],
                "level": s[1],
                "name": s[2],
                "category": s[3],
                "help": s[4],
                "options": s[5],
                "unlocked": lvl >= s[1],
            }
            for s in SPECS
        ],
    }
    db.commit()
    return result


@router.put("/me/vip/benefits/selection")
def select_benefit(
    payload: Selection, user=Depends(current_cosmetic_user), db=Depends(get_db)
):
    row = locked(db, user)
    data = json.loads(row.selections)
    key = payload.key
    value = payload.value
    text_fields = {
        "status_text": ("status", 60),
        "welcome_text": ("welcome", 80),
        "board_text": ("room_board", 120),
    }
    if key in text_fields:
        benefit, limit = text_fields[key]
        require(db, user.id, benefit)
        if value and (len(value) > limit or any(ord(c) < 32 for c in value)):
            raise HTTPException(422, f"En fazla {limit} karakter kullan.")
    elif key == "trial_scene":
        lease = db.get(VipBenefitLease, (user.id, value)) if value else None
        if value and (not lease or utc(lease.expires_at) <= now()):
            raise HTTPException(403, "Bu deneme hakkı yok veya süresi doldu.")
    elif key in ("point_cover", "point_seal"):
        raise HTTPException(
            410, "VIP puanı sistemi kaldırıldı. Yeni seviye ödüllerinden seçim yap."
        )
    elif key.startswith("level_"):
        from .vip_level_rewards import BY_ID, SLOTS

        if key not in SLOTS:
            raise HTTPException(422, "Geçersiz ödül alanı.")
        if value:
            item = BY_ID.get(value)
            if not item or key != "level_" + item[3]:
                raise HTTPException(422, "Geçersiz seviye ödülü.")
            if level(db, user.id) < item[0]:
                raise HTTPException(403, f"VIP {item[0]} gerekli.")
    else:
        require(db, user.id, key)
        if not SPEC[key][5]:
            raise HTTPException(422, "Bu ödülün kendi işlem düğmesini kullan.")
        if value and value not in SPEC[key][5]:
            raise HTTPException(422, "Geçersiz Lidya görünümü.")
    if value:
        for group in (
            ("cover", "cover_pack"),
            ("scenes", "throne", "royal_scene", "trial_scene", "point_cover"),
            ("room_decor", "palace_room", "royal_room"),
        ):
            if key in group:
                for other in group:
                    if other != key:
                        data.pop(other, None)
        data[key] = value
    else:
        data.pop(key, None)
    save(row, data)
    db.commit()
    return {"ok": True, "active": active(db, user.id)}


@router.post("/me/vip/benefits/claim/{kind}")
def claim(
    kind: str,
    payload: TrialRequest,
    user=Depends(current_cosmetic_user),
    db=Depends(get_db),
):
    if kind == "daily":
        raise HTTPException(
            410, "VIP puanı sistemi kaldırıldı; ödüller seviyende otomatik açılır."
        )
    row = locked(db, user)
    require(db, user.id, kind)
    if kind not in ("weekly_trial", "weekly_box", "monthly_trial"):
        raise HTTPException(404, "Ödül bulunamadı.")
    key = receipt_key(kind)
    existing = db.get(VipBenefitReceipt, (user.id, key))
    if existing:
        return {"ok": True, "already_claimed": True}
    lvl = level(db, user.id)
    amount = 0
    if payload.item not in TRIALS:
        raise HTTPException(422, "Geçersiz deneme seçimi.")
    days = (
        1 if kind == "weekly_trial" else 3 if kind == "weekly_box" else trial_days(lvl)
    )
    grant_lease(db, user.id, payload.item, days)
    db.add(VipBenefitReceipt(user_id=user.id, key=key, amount=amount, created_at=now()))
    db.commit()
    return {"ok": True, "already_claimed": False}


def grant_lease(db, uid, item, days):
    # Parallel reward sources never stack durations into an unlimited lease.
    expiry = now() + timedelta(days=days)
    lease = db.get(VipBenefitLease, (uid, item))
    if lease:
        lease.expires_at = max(utc(lease.expires_at), expiry)
    else:
        db.add(VipBenefitLease(user_id=uid, item=item, expires_at=expiry))


@router.post("/me/vip/benefits/shop/{item}")
def buy_points(item: str, user=Depends(current_cosmetic_user), db=Depends(get_db)):
    raise HTTPException(
        410,
        "VIP puanı mağazası kaldırıldı. Ödüller ilgili VIP seviyesinde otomatik açılır.",
    )


@router.get("/me/vip/benefits/friend/{public_id}")
def verify_friend(
    public_id: str, user=Depends(current_cosmetic_user), db=Depends(get_db)
):
    require(db, user.id, "friend_pass")
    target = friend_target(db, user, public_id)
    return {"public_id": target.public_id, "nickname": target.nickname}


def friend_target(db, user, public_id):
    target = db.scalar(
        select(User).where(User.public_id == public_id, User.is_active.is_(True))
    )
    if not target or target.id == user.id:
        raise HTTPException(404, "Uygun kullanıcı bulunamadı.")
    blocked = db.scalar(
        select(UserBlock.id).where(
            ((UserBlock.blocker_id == user.id) & (UserBlock.blocked_id == target.id))
            | ((UserBlock.blocker_id == target.id) & (UserBlock.blocked_id == user.id))
        )
    )
    if blocked:
        raise HTTPException(403, "Bu kullanıcıya kart gönderilemez.")
    from .moderation import active_ban

    if active_ban(db, target.id):
        raise HTTPException(403, "Bu kullanıcıya kart gönderilemez.")
    return target


@router.post("/me/vip/benefits/friend")
def send_friend(
    payload: FriendRequest, user=Depends(current_cosmetic_user), db=Depends(get_db)
):
    # Lock both users in canonical order to serialize reciprocal sends and claims.
    require(db, user.id, "friend_pass")
    target = friend_target(db, user, payload.public_id)
    list(
        db.scalars(
            select(User.id)
            .where(User.id.in_([user.id, target.id]))
            .order_by(User.id)
            .with_for_update()
        )
    )
    row = locked(db, user)
    if payload.item not in TRIALS:
        raise HTTPException(422, "Geçersiz deneme seçimi.")
    key = f'friend:{period("monthly")}:{target.id}'
    if len(key) > 120:
        raise HTTPException(422, "Kullanıcı anahtarı geçersiz.")
    if db.get(VipBenefitReceipt, (user.id, key)):
        return {"ok": True, "already_sent": True}
    used = sum(
        k.startswith("friend:" + period("monthly") + ":")
        for k in db.scalars(
            select(VipBenefitReceipt.key).where(VipBenefitReceipt.user_id == user.id)
        )
    )
    if used >= friend_limit(level(db, user.id)):
        raise HTTPException(403, "Bu ayın deneme kartları tükendi.")
    grant_lease(db, target.id, payload.item, 3)
    db.add(VipBenefitReceipt(user_id=user.id, key=key, amount=1, created_at=now()))
    from .platform_models import Notification

    db.add(
        Notification(
            user_id=target.id,
            kind="vip_trial",
            title="Lidya deneme kartı",
            body=f"{user.nickname} sana 3 günlük {TRIALS[payload.item]} gönderdi. VIP → Ek ödüller → Deneme kartlarım bölümünden etkinleştirebilirsin.",
        )
    )
    db.commit()
    return {"ok": True, "recipient": target.nickname}


@router.put("/me/vip/benefits/showcase")
def set_showcase(
    payload: ShowcaseRequest, user=Depends(current_cosmetic_user), db=Depends(get_db)
):
    row = locked(db, user)
    require(db, user.id, "showcase")
    if len(payload.items) > capacity(level(db, user.id)):
        raise HTTPException(422, "Vitrin kapasiten aşıldı.")
    owned = {
        (r.cosmetic_type, r.asset_key)
        for r in db.scalars(select(UserCosmetic).where(UserCosmetic.user_id == user.id))
    }
    result = []
    for i in payload.items:
        pair = (i.get("type"), i.get("key"))
        if pair not in owned:
            raise HTTPException(
                403, "Yalnızca sahip olduğun ürünleri sergileyebilirsin."
            )
        if i not in result:
            result.append({"type": pair[0], "key": pair[1]})
    data = json.loads(row.selections)
    data["showcase"] = result
    save(row, data)
    db.commit()
    return {"ok": True}


@router.get("/me/vip/benefits/photos")
def photos(user=Depends(current_cosmetic_user), db=Depends(get_db)):
    require(db, user.id, "gallery")
    from .platform_models import SocialPost

    return {
        "items": [
            {"id": p.id, "caption": p.caption[:80]}
            for p in db.scalars(
                select(SocialPost)
                .where(
                    SocialPost.user_id == user.id,
                    SocialPost.audience == "public",
                    SocialPost.is_hidden.is_(False),
                    SocialPost.mime_type.like("image/%"),
                )
                .order_by(SocialPost.id.desc())
                .limit(100)
            )
        ]
    }


@router.put("/me/vip/benefits/gallery")
def set_gallery(
    payload: GalleryRequest, user=Depends(current_cosmetic_user), db=Depends(get_db)
):
    row = locked(db, user)
    require(db, user.id, "gallery")
    from .platform_models import SocialPost

    ids = list(dict.fromkeys(payload.post_ids))
    valid = set(
        db.scalars(
            select(SocialPost.id).where(
                SocialPost.id.in_(ids),
                SocialPost.user_id == user.id,
                SocialPost.audience == "public",
                SocialPost.is_hidden.is_(False),
                SocialPost.mime_type.like("image/%"),
            )
        )
    )
    if set(ids) != valid:
        raise HTTPException(403, "Yalnızca kendi açık fotoğrafların seçilebilir.")
    data = json.loads(row.selections)
    data["gallery"] = ids
    save(row, data)
    db.commit()
    return {"ok": True}


@router.get("/me/vip/benefits/favorites/{kind}")
def favorites(kind: str, user=Depends(current_cosmetic_user), db=Depends(get_db)):
    require(db, user.id, "favorites" if kind == "rooms" else "gift_favorites")
    data = values(db, user.id)
    if kind == "rooms":
        from .room_models import Room

        rows = list(
            db.scalars(select(Room).where(Room.id.in_(data.get("favorite_rooms", []))))
        )
        return {
            "items": [
                {"id": r.id, "public_id": r.public_id, "name": r.name} for r in rows
            ]
        }
    if kind != "gifts":
        raise HTTPException(404, "Liste bulunamadı.")
    from .room_routes import GIFT_META

    return {
        "items": [
            {"id": k, "name": GIFT_META.get(k, {}).get("name", k)}
            for k in data.get("favorite_gifts", [])
            if k in GIFT_META
        ]
    }


@router.put("/me/vip/benefits/favorites/{kind}")
def set_favorites(
    kind: str,
    payload: FavoriteRequest,
    user=Depends(current_cosmetic_user),
    db=Depends(get_db),
):
    row = locked(db, user)
    require(db, user.id, "favorites" if kind == "rooms" else "gift_favorites")
    ids = list(dict.fromkeys(payload.ids))
    if kind == "rooms":
        from .room_models import Room

        valid = list(
            db.scalars(
                select(Room.id).where((Room.id.in_(ids)) | (Room.public_id.in_(ids)))
            )
        )
        if len(valid) != len(ids):
            raise HTTPException(
                404, "Oda bulunamadı veya aynı oda birden fazla seçildi."
            )
        ids = valid
    elif kind == "gifts":
        from .room_routes import GIFT_META

        if len(ids) > 12 or any(k not in GIFT_META for k in ids):
            raise HTTPException(422, "En fazla 12 geçerli hediye seç.")
    else:
        raise HTTPException(404, "Liste bulunamadı.")
    data = json.loads(row.selections)
    data["favorite_" + kind] = ids
    save(row, data)
    db.commit()
    return {"ok": True}


@router.get("/me/vip/benefits/vote")
def vote_status(user=Depends(current_cosmetic_user), db=Depends(get_db)):
    require(db, user.id, "vote")
    prefix = "vote:" + period("monthly") + ":"
    counts = {k: 0 for k in ("sardis", "paktolos", "palace")}
    mine = None
    for r in db.scalars(
        select(VipBenefitReceipt).where(VipBenefitReceipt.key.like(prefix + "%"))
    ):
        choice = r.key[len(prefix) :]
        if choice in counts:
            counts[choice] += 1
        if r.user_id == user.id:
            mine = choice
    return {"period": period("monthly"), "counts": counts, "selected": mine}


@router.post("/me/vip/benefits/vote/{choice}")
def vote(choice: str, user=Depends(current_cosmetic_user), db=Depends(get_db)):
    locked(db, user)
    require(db, user.id, "vote")
    if choice not in ("sardis", "paktolos", "palace"):
        raise HTTPException(422, "Geçersiz koleksiyon.")
    prefix = "vote:" + period("monthly") + ":"
    for r in db.scalars(
        select(VipBenefitReceipt).where(
            VipBenefitReceipt.user_id == user.id,
            VipBenefitReceipt.key.like(prefix + "%"),
        )
    ):
        db.delete(r)
    db.flush()
    db.add(
        VipBenefitReceipt(
            user_id=user.id, key=prefix + choice, amount=1, created_at=now()
        )
    )
    db.commit()
    return {"ok": True}


@router.get("/me/vip/benefits/gift-options")
def gift_options(user=Depends(current_cosmetic_user), db=Depends(get_db)):
    require(db, user.id, "gift_favorites")
    from .room_routes import GIFT_META, GIFT_CATALOG

    return {
        "items": [
            {"id": k, "name": GIFT_META.get(k, {}).get("name", k), "price": price}
            for k, price in GIFT_CATALOG.items()
        ]
    }


@router.get("/me/vip/benefits/coupon")
def coupon_status(user=Depends(current_cosmetic_user), db=Depends(get_db)):
    pct = COUPON[level(db, user.id)]
    return {
        "percent": (
            pct
            if active(db, user.id).get("coupon") and not claimed(db, user.id, "coupon")
            else 0
        ),
        "period": period("monthly"),
    }


@router.get("/me/vip/membership")
def membership_status(user=Depends(current_cosmetic_user), db=Depends(get_db)):
    from .vip_membership import status_view

    result = status_view(db, user.id)
    db.commit()
    return result
