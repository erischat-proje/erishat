"""BT-only immutable 16-digit referral enrollment. No normal-user or wallet modifications."""
from datetime import datetime, timezone
import secrets

from fastapi import Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, select, update
from sqlalchemy.orm import Mapped, Session, mapped_column
from sqlalchemy.exc import IntegrityError

from .db import Base, get_db
from .models import User


class BTReferral(Base):
    __tablename__ = "bt_referrals_v1"
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    code: Mapped[str] = mapped_column(String(16), nullable=False, unique=True)
    parent_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class BTActivationBody(BaseModel):
    code: str = Field(pattern=r"^[0-9]{16}$")


class BTBootstrapBody(BaseModel):
    public_id: str = Field(min_length=1, max_length=64)


def ensure_bt_referral(db: Session, user_id: str) -> BTReferral:
    """Call with a locked inventory row for this user in write paths."""
    existing = db.get(BTReferral, user_id)
    if existing:
        return existing
    # High-entropy cryptographic randomness, stored as a string (zeros preserved).
    for _ in range(12):
        code = f"{secrets.randbelow(10**16):016d}"
        if db.scalar(select(BTReferral.user_id).where(BTReferral.code == code)) is None:
            row = BTReferral(user_id=user_id, code=code)
            db.add(row)
            db.flush()
            return row
    raise HTTPException(503, "Referans kodu üretilemedi")


def require_bt_activation(db: Session, user_id: str) -> BTReferral:
    row = db.get(BTReferral, user_id)
    if not row or row.activated_at is None:
        raise HTTPException(403, "Bayi Temsilcisi sistemi için referans aktivasyonu gerekli")
    return row


def install_referral_routes(router, current_user, require_da, require_dealer, designation, target_by_public_id):
    """Register inside dealer_routes.register_auth, after auth dependency is known."""

    def bt_only(db, user, lock=False):
        inv = require_dealer(db, user, lock=lock)
        if designation(db, user.id) != "support":
            raise HTTPException(403, "Bu alan yalnızca Bayi Temsilcilerine özeldir")
        return inv

    @router.get("/reference/me")
    def my_referral(db: Session = Depends(get_db), user: User = Depends(current_user)):
        bt_only(db, user, lock=True)
        record = ensure_bt_referral(db, user.id)
        db.commit()
        return {"code": record.code, "active": record.activated_at is not None,
                "parent_locked": record.parent_id is not None,
                "bootstrap": record.activated_at is not None and record.parent_id is None}

    @router.post("/reference/activate")
    def activate_referral(body: BTActivationBody, db: Session = Depends(get_db), user: User = Depends(current_user)):
        bt_only(db, user, lock=True)
        mine = ensure_bt_referral(db, user.id)
        if mine.activated_at is not None:
            raise HTTPException(409, "Referans bağlantınız kalıcıdır ve değiştirilemez")
        parent = db.scalar(select(BTReferral).where(BTReferral.code == body.code))
        if not parent or parent.user_id == user.id or parent.activated_at is None:
            raise HTTPException(400, "Geçerli ve aktif başka bir BT referans kodu giriniz")
        # Parent must still have active BT designation.
        from .dealer_routes import DealerInventory, DealerDesignation
        parent_inventory = db.get(DealerInventory, parent.user_id)
        parent_role = db.get(DealerDesignation, parent.user_id)
        if not parent_inventory or not parent_inventory.active or not parent_role or parent_role.kind != "support":
            raise HTTPException(400, "Referans sahibi aktif bayi temsilcisi değil")
        changed = db.execute(update(BTReferral).where(
            BTReferral.user_id == user.id, BTReferral.activated_at.is_(None), BTReferral.parent_id.is_(None)
        ).values(parent_id=parent.user_id, activated_at=datetime.now(timezone.utc)))
        if changed.rowcount != 1:
            db.rollback()
            raise HTTPException(409, "Bu hesap daha önce aktive edilmiş")
        db.commit()
        return {"ok": True, "active": True, "locked": True}

    @router.get("/reference/team")
    def my_bt_team(limit: int = Query(default=100, ge=1, le=500), db: Session = Depends(get_db), user: User = Depends(current_user)):
        bt_only(db, user)
        require_bt_activation(db, user.id)
        from .dealer_routes import DealerInventory, DealerDesignation
        rows = db.execute(select(User, BTReferral.activated_at).join(
            BTReferral, BTReferral.user_id == User.id
        ).join(DealerInventory, DealerInventory.user_id == User.id).join(
            DealerDesignation, DealerDesignation.user_id == User.id
        ).where(BTReferral.parent_id == user.id, BTReferral.activated_at.is_not(None),
                User.is_active.is_(True), DealerInventory.active.is_(True),
                DealerDesignation.kind == "support").order_by(BTReferral.activated_at.desc()).limit(limit)).all()
        return {"items": [{"public_id": person.public_id, "nickname": person.nickname,
                           "activated_at": when.isoformat() if when else None} for person, when in rows]}

    @router.post("/admin/reference/bootstrap")
    def bootstrap_first_bt(body: BTBootstrapBody, db: Session = Depends(get_db), user: User = Depends(current_user)):
        require_da(db, user)
        target = target_by_public_id(db, body.public_id)
        bt_only(db, target, lock=True)
        existing_root = db.scalar(select(BTReferral.user_id).where(
            BTReferral.activated_at.is_not(None), BTReferral.parent_id.is_(None)).limit(1))
        record = ensure_bt_referral(db, target.id)
        if record.activated_at is not None:
            raise HTTPException(409, "Bu temsilci zaten aktif")
        if existing_root is not None:
            raise HTTPException(409, "İlk BT daha önce aktif edilmiş")
        record.activated_at = datetime.now(timezone.utc)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, "İlk BT eşzamanlı bir işlemle zaten aktif edildi")
        return {"ok": True, "public_id": target.public_id, "active": True}

# BT_REFERENCE_SECURITY_UI_V1: one-root uniqueness is enforced by DB startup index.
