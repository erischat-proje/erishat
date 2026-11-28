"""LidyaChat Welcome Packages V1 - read-only foundation."""
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends
from .welcome_cosmetics import rewards_for

OFFER_DAYS = 7

COLLECTION_NAMES = {
    "male": {
        "bronze": "Bronz Savaşçı",
        "silver": "Gümüş Hükümdar",
        "gold": "Altın İmparator",
    },
    "female": {
        "bronze": "Bronz Zarafet",
        "silver": "Gümüş Prenses",
        "gold": "Altın Kraliçe",
    },
}

PACKAGES = (
    {
        "id": "bronze",
        "product_id": "welcome_bronze_v1",
        "name": "Bronz Paket",
        "price_kurus": 9999,
        "lidya": 6000,
        "duration_days": 7,
        "cosmetics": ("frame", "bubble"),
    },
    {
        "id": "silver",
        "product_id": "welcome_silver_v1",
        "name": "Gumus Paket",
        "price_kurus": 24999,
        "lidya": 14000,
        "duration_days": 15,
        "cosmetics": (
            "frame", "bubble", "profile", "entrance"
        ),
    },
    {
        "id": "gold",
        "product_id": "welcome_gold_v1",
        "name": "Altin Paket",
        "price_kurus": 49999,
        "lidya": 28000,
        "duration_days": 30,
        "cosmetics": (
            "frame", "bubble", "profile", "entrance", "title"
        ),
    },
)

def utc(value):
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def offer_status(user, now=None):
    now = utc(now or datetime.now(timezone.utc))
    created = getattr(user, "created_at", None)
    expires = (
        utc(created) + timedelta(days=OFFER_DAYS)
        if created else None
    )

    gender = getattr(user, "gender", None)
    eligible = bool(
        gender in COLLECTION_NAMES
        and
        getattr(user, "is_active", False)
        and getattr(user, "profile_completed", False)
        and created
        and utc(created) <= now < expires
    )

    return {
        "eligible_for_offer": eligible,
        "collection": gender if eligible else None,
        "purchase_enabled": False,
        "offer_days": OFFER_DAYS,
        "expires_at": (
            expires.isoformat() if expires else None
        ),
        "remaining_seconds": (
            int((expires - now).total_seconds())
            if eligible else 0
        ),
        "packages": [
            {
                **p,
                "name": COLLECTION_NAMES[gender][p["id"]],
                "collection": gender,
                "collection_id": f"welcome_{gender}_{p['id']}_v1",
                "cosmetic_rewards": rewards_for(
                    gender, p["id"]
                ),
                "cosmetics": list(p["cosmetics"]),
                "purchase_limit": 1,
                "currency": "TRY",
            }
            for p in PACKAGES
        ] if eligible else [],
    }


def register_auth(current_user):
    router = APIRouter(
        prefix="/v1/welcome-packages",
        tags=["welcome-packages"],
    )

    @router.get("/status")
    def status(user=Depends(current_user)):
        return offer_status(user)

    return router
