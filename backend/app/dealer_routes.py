"""LidyaChat dealers: independent, non-spendable dealer inventory and audited allocation.

No user wallet is credited on appointment or inventory allocation. Only an
explicit dealer transfer credits a recipient, while atomically debiting stock.
"""
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint, func, select, update
from sqlalchemy.orm import Mapped, Session, mapped_column

from .admin_models import AdminRole
from .db import Base, get_db
from .models import User

router = APIRouter(prefix="/v1/dealers", tags=["Lidya Bayi"])
MAX_STOCK = 9_000_000_000_000_000


class DealerInventory(Base):
    __tablename__ = "dealer_inventories"
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    stock: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    appointed_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (CheckConstraint("stock >= 0", name="dealer_stock_nonnegative"),)


class DealerTransfer(Base):
    __tablename__ = "dealer_transfers"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    dealer_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    recipient_id: Mapped[str] = mapped_column(String(64), nullable=False)
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    request_key: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (UniqueConstraint("dealer_id", "request_key", name="uq_dealer_transfer_request"), CheckConstraint("amount > 0", name="dealer_transfer_positive"))


class DealerStockGrant(Base):
    __tablename__ = "dealer_stock_grants"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    dealer_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    admin_id: Mapped[str] = mapped_column(String(64), nullable=False)
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    request_key: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (CheckConstraint("amount > 0", name="dealer_grant_positive"),)


class AssignBody(BaseModel):
    public_id: str = Field(min_length=1, max_length=64)


class StockBody(AssignBody):
    amount: int = Field(gt=0, le=MAX_STOCK)
    request_key: str = Field(min_length=16, max_length=64)


class TransferBody(BaseModel):
    recipient_public_id: str = Field(min_length=1, max_length=64)
    amount: int = Field(gt=0, le=MAX_STOCK)
    request_key: str = Field(min_length=16, max_length=64)


def target_by_public_id(db, public_id):
    row = db.scalar(select(User).where(User.public_id == public_id.strip()))
    if not row or not row.is_active:
        raise HTTPException(404, "Aktif kullanıcı ID bulunamadı")
    return row


def require_da(db, user):
    role = db.get(AdminRole, user.id)
    if not role or role.role != "DA":
        raise HTTPException(403, "Yalnızca DA Lidya bayisi atayabilir veya stok verebilir")


def require_dealer(db, user, lock=False):
    row = db.scalar(select(DealerInventory).where(DealerInventory.user_id == user.id).with_for_update() if lock else select(DealerInventory).where(DealerInventory.user_id == user.id))
    if not row or not row.active:
        raise HTTPException(403, "Aktif Lidya bayisi yetkiniz yok")
    return row


def register_auth(current_user):
    @router.get("/me")
    def my_dealership(db: Session = Depends(get_db), user: User = Depends(current_user)):
        row = require_dealer(db, user)
        return {"dealer": True, "public_id": user.public_id, "stock": row.stock, "badge": "LB"}

    @router.get("/badges")
    def badges(ids: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
        keys = list(dict.fromkeys(x.strip() for x in ids.split(",") if x.strip()))
        if len(keys) > 100 or any(len(x) > 64 for x in keys):
            raise HTTPException(400, "En fazla 100 ID sorgulanabilir")
        rows = db.scalars(select(DealerInventory.user_id).where(DealerInventory.user_id.in_(keys), DealerInventory.active.is_(True))).all()
        return {"dealers": rows}

    @router.get("/admin/list")
    def admin_dealer_list(limit: int = Query(default=50, ge=1, le=100),
                          db: Session = Depends(get_db), user: User = Depends(current_user)):
        require_da(db, user)
        rows = db.execute(select(DealerInventory, User)
            .join(User, User.id == DealerInventory.user_id)
            .order_by(DealerInventory.created_at.desc()).limit(limit)).all()
        return {"items": [{"public_id": person.public_id, "nickname": person.nickname,
            "stock": inv.stock, "active": inv.active} for inv, person in rows]}

    @router.get("/admin/lookup")
    def admin_dealer_lookup(public_id: str = Query(min_length=1, max_length=64),
                            db: Session = Depends(get_db), user: User = Depends(current_user)):
        require_da(db, user)
        person = target_by_public_id(db, public_id)
        inv = db.get(DealerInventory, person.id)
        if inv is None:
            raise HTTPException(404, "Bu ID için bayi kaydı bulunamadı")
        grants = db.scalars(select(DealerStockGrant)
            .where(DealerStockGrant.dealer_id == person.id)
            .order_by(DealerStockGrant.created_at.desc()).limit(20)).all()
        transfers = db.scalars(select(DealerTransfer)
            .where(DealerTransfer.dealer_id == person.id)
            .order_by(DealerTransfer.created_at.desc()).limit(20)).all()
        receiver_ids = [t.recipient_id for t in transfers]
        receivers = {r.id: r.public_id for r in db.scalars(select(User)
            .where(User.id.in_(receiver_ids))).all()} if receiver_ids else {}
        granted_total = db.scalar(select(func.coalesce(func.sum(DealerStockGrant.amount), 0))
            .where(DealerStockGrant.dealer_id == person.id))
        sent_total = db.scalar(select(func.coalesce(func.sum(DealerTransfer.amount), 0))
            .where(DealerTransfer.dealer_id == person.id))
        return {"public_id": person.public_id, "nickname": person.nickname,
            "active": inv.active, "stock": inv.stock,
            "total_granted": int(granted_total or 0), "total_sent": int(sent_total or 0),
            "recent_grants": [{"amount": r.amount, "created_at": r.created_at.isoformat()}
                for r in grants],
            "recent_transfers": [{"recipient_public_id": receivers.get(r.recipient_id, "—"),
                "amount": r.amount, "created_at": r.created_at.isoformat()}
                for r in transfers]}

    @router.post("/admin/assign")
    def assign(body: AssignBody, db: Session = Depends(get_db), user: User = Depends(current_user)):
        require_da(db, user)
        target = target_by_public_id(db, body.public_id)
        row = db.scalar(select(DealerInventory).where(DealerInventory.user_id == target.id).with_for_update())
        if not row:
            db.add(DealerInventory(user_id=target.id, appointed_by=user.id, stock=0, active=True))
        else:
            row.active = True
        db.commit()
        return {"ok": True, "public_id": target.public_id, "badge": "LB", "stock": row.stock if row else 0}

    @router.post("/admin/stock")
    def grant(body: StockBody, db: Session = Depends(get_db), user: User = Depends(current_user)):
        require_da(db, user)
        target = target_by_public_id(db, body.public_id)
        # Lock the dealer's inventory before reading the idempotency key.
        # Concurrent retries will see the committed original grant.
        row = db.scalar(select(DealerInventory).where(
            DealerInventory.user_id == target.id).with_for_update())
        if row is None or not row.active:
            raise HTTPException(409, "Aktif bayi bulunamadı")
        prior = db.scalar(select(DealerStockGrant).where(DealerStockGrant.request_key == body.request_key))
        if prior:
            target = target_by_public_id(db, body.public_id)
            if prior.dealer_id != target.id or prior.admin_id != user.id or prior.amount != body.amount:
                raise HTTPException(409, "İşlem anahtarı başka bir işlemde kullanılmış")
            row = db.get(DealerInventory, target.id)
            return {"ok": True, "stock": row.stock, "replayed": True}
        # Atomic increment; other stock loads and transfers never overwrite each other.
        result = db.execute(update(DealerInventory).where(
            DealerInventory.user_id == target.id, DealerInventory.active.is_(True),
            DealerInventory.stock <= MAX_STOCK - body.amount
        ).values(stock=DealerInventory.stock + body.amount).returning(DealerInventory.stock)).scalar_one_or_none()
        if result is None:
            db.rollback()
            raise HTTPException(409, "Aktif bayi bulunamadı veya stok sınırı aşılıyor")
        db.add(DealerStockGrant(id=str(uuid4()), dealer_id=target.id, admin_id=user.id,
                                amount=body.amount, request_key=body.request_key))
        try:
            db.commit()
        except Exception:
            db.rollback()
            raise
        return {"ok": True, "public_id": target.public_id, "stock": result, "replayed": False}

    @router.post("/transfer")
    def transfer(body: TransferBody, db: Session = Depends(get_db), user: User = Depends(current_user)):
        # Serialize attempts, including duplicate retries, against this stock row.
        dealer = require_dealer(db, user, lock=True)
        recipient = target_by_public_id(db, body.recipient_public_id)
        if recipient.id == user.id:
            raise HTTPException(400, "Bayi kendisine stok aktaramaz")
        prior = db.scalar(select(DealerTransfer).where(DealerTransfer.dealer_id == user.id,
                                                     DealerTransfer.request_key == body.request_key))
        if prior:
            if prior.recipient_id != recipient.id or prior.amount != body.amount:
                raise HTTPException(409, "İşlem anahtarı başka bir aktarımda kullanılmış")
            db.refresh(dealer)
            return {"ok": True, "stock": dealer.stock, "transfer_id": prior.id, "replayed": True}
        # Row-level atomic decrement forbids negative inventory, including concurrent requests.
        stock = db.execute(update(DealerInventory).where(
            DealerInventory.user_id == user.id, DealerInventory.active.is_(True),
            DealerInventory.stock >= body.amount
        ).values(stock=DealerInventory.stock - body.amount).returning(DealerInventory.stock)).scalar_one_or_none()
        if stock is None:
            db.rollback()
            raise HTTPException(409, "Bayi stoğunuz yetersiz veya yetkiniz kaldırılmış")
        # Keep signed BIGINT wallet balances within the database column limit.
        result = db.execute(update(User).where(
            User.id == recipient.id, User.is_active.is_(True),
            User.lidya <= 9_223_372_036_854_775_807 - body.amount
        ).values(lidya=User.lidya + body.amount))
        if result.rowcount != 1:
            db.rollback()
            raise HTTPException(409, "Alıcı hesabı aktif değil veya bakiye üst sınırı aşılıyor")
        tx = DealerTransfer(id=str(uuid4()), dealer_id=user.id, recipient_id=recipient.id,
                            amount=body.amount, request_key=body.request_key)
        db.add(tx)
        try:
            db.commit()
        except Exception:
            db.rollback()
            raise
        return {"ok": True, "stock": stock, "recipient_public_id": recipient.public_id,
                "amount": body.amount, "transfer_id": tx.id, "replayed": False}

    @router.get("/history")
    def history(db: Session = Depends(get_db), user: User = Depends(current_user)):
        require_dealer(db, user)
        rows = db.scalars(select(DealerTransfer).where(DealerTransfer.dealer_id == user.id)
                          .order_by(DealerTransfer.created_at.desc()).limit(30)).all()
        people = {p.id: p.public_id for p in db.scalars(select(User).where(User.id.in_([r.recipient_id for r in rows]))).all()}
        return {"items": [{"id": t.id, "recipient_public_id": people.get(t.recipient_id, "—"),
                            "amount": t.amount, "created_at": t.created_at.isoformat()}
                           for t in rows]}

    @router.get("/admin/audit")
    def admin_dealer_audit(public_id: str | None = Query(default=None, min_length=1, max_length=64),
                           limit: int = Query(default=50, ge=1, le=100),
                           db: Session = Depends(get_db), user: User = Depends(current_user)):
        """DA-only read-only reconciliation; flags require human review."""
        from .dealer_audit_v8 import audit_inventory
        require_da(db, user)
        stmt = (select(DealerInventory, User).join(User, User.id == DealerInventory.user_id)
                .order_by(DealerInventory.created_at.desc()).limit(limit))
        if public_id is not None:
            stmt = stmt.where(User.public_id == public_id.strip())
        rows = db.execute(stmt).all()
        if public_id and not rows:
            raise HTTPException(404, "Bayi bulunamadı")
        items = [audit_inventory(db, inv, person, DealerStockGrant, DealerTransfer)
                 for inv, person in rows]
        return {"items": items, "review_count": sum(x["status"] == "REVIEW" for x in items),
                "read_only": True, "note": "Sapma veya hacim uyarısı tek başına usulsüzlük kanıtı değildir."}

    return router
