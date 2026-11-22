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



class LBReferral(Base):
    """LB -> BT permanent reference relationship."""
    __tablename__ = "lb_referral_links_v2"
    user_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True
    )
    bt_user_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id"), nullable=False, index=True
    )
    activated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )


def install_referral_routes(router, current_user, require_da,
                            require_dealer, designation, target_by_public_id):
    """BT distributes code; LB enters it once to activate."""

    def dealer_kind(db, user, expected, lock=False):
        require_dealer(db, user, lock=lock)
        if designation(db, user.id) != expected:
            raise HTTPException(403, "Bu islem hesabinizin yetkisine uygun degil")

    @router.get("/reference/me")
    def my_referral(db: Session = Depends(get_db),
                    user: User = Depends(current_user)):
        kind = designation(db, user.id)
        if kind == "support":
            dealer_kind(db, user, "support", lock=True)
            record = ensure_bt_referral(db, user.id)
            db.commit()
            return {
                "code": record.code, "active": True,
                "parent_locked": False, "kind": "support"
            }
        dealer_kind(db, user, "dealer")
        link = db.get(LBReferral, user.id)
        return {
            "code": None, "active": link is not None,
            "parent_locked": link is not None, "kind": "dealer"
        }

    @router.post("/reference/activate")
    def activate_referral(body: BTActivationBody,
                          db: Session = Depends(get_db),
                          user: User = Depends(current_user)):
        dealer_kind(db, user, "dealer", lock=True)
        if db.get(LBReferral, user.id):
            raise HTTPException(409, "Referans baglantiniz kalicidir")

        parent = db.scalar(
            select(BTReferral).where(BTReferral.code == body.code)
        )
        if parent is None:
            raise HTTPException(400, "Gecersiz BT referans kodu")

        from .dealer_routes import DealerInventory
        inv = db.get(DealerInventory, parent.user_id)
        if (inv is None or not inv.active or
                designation(db, parent.user_id) != "support"):
            raise HTTPException(400, "Referans sahibi aktif BT degil")

        db.add(LBReferral(
            user_id=user.id,
            bt_user_id=parent.user_id,
            activated_at=datetime.now(timezone.utc)
        ))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, "LB daha once aktive edildi")
        return {"ok": True, "active": True, "locked": True}

    @router.get("/reference/team")
    def my_bt_team(
        limit: int = Query(default=100, ge=1, le=500),
        db: Session = Depends(get_db),
        user: User = Depends(current_user)
    ):
        dealer_kind(db, user, "support")
        from .dealer_routes import DealerInventory, DealerDesignation
        rows = db.execute(
            select(User, LBReferral.activated_at)
            .join(LBReferral, LBReferral.user_id == User.id)
            .join(DealerInventory, DealerInventory.user_id == User.id)
            .outerjoin(DealerDesignation, DealerDesignation.user_id == User.id)
            .where(
                LBReferral.bt_user_id == user.id,
                User.is_active.is_(True),
                DealerInventory.active.is_(True),
                ((DealerDesignation.kind == "dealer") | (DealerDesignation.user_id.is_(None)))
            )
            .order_by(LBReferral.activated_at.desc())
            .limit(limit)
        ).all()
        return {"items": [
            {
                "public_id": person.public_id,
                "nickname": person.nickname,
                "activated_at": when.isoformat()
            }
            for person, when in rows
        ]}
