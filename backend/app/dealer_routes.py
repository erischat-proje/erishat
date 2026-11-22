"""LidyaChat dealers: independent, non-spendable dealer inventory and audited allocation.

No user wallet is credited on appointment or inventory allocation. Only an
explicit dealer transfer credits a recipient, while atomically debiting stock.
"""
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import LargeBinary, BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint, func, literal, select, union_all, update
from sqlalchemy.orm import Mapped, Session, mapped_column

from .admin_models import AdminRole
from .dealer_evidence_v3 import validate_evidence
from .db import Base, get_db
from .models import User
# BT_REFERENCE_V1: immutable BT-only referral program.
from .dealer_referrals import (BTReferral, LBReferral, ensure_bt_referral, install_referral_routes)


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


class DealerDesignation(Base):
    """Display identity only; money remains in DealerInventory."""
    __tablename__ = 'dealer_designations_v1'
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default='coin')
    assigned_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (CheckConstraint("kind IN ('coin', 'support')", name='dealer_designation_kind_v1'),)


class DealerRepresentativePresence(Base):
    """Short-lived activity marker for *authorized* BT representatives."""
    __tablename__ = 'dealer_representative_presence_v1'
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


def designation(db, user_id):
    row = db.get(DealerDesignation, user_id)
    return row.kind if row else 'dealer'


def dealer_badge(kind):
    return 'BT' if kind == 'support' else 'CT' if kind == 'coin' else 'LB'


class DealerTransfer(Base):
    __tablename__ = "dealer_transfers"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    dealer_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    recipient_id: Mapped[str] = mapped_column(String(64), nullable=False)
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    request_key: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (UniqueConstraint("dealer_id", "request_key", name="uq_dealer_transfer_request"), CheckConstraint("amount > 0", name="dealer_transfer_positive"))



class DealerTransferEvidence(Base):
    """Immutable evidence for a completed Lidya transfer."""
    __tablename__ = "dealer_transfer_evidence_v3"

    transfer_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("dealer_transfers.id", ondelete="CASCADE"),
        primary_key=True
    )
    uploaded_by: Mapped[str] = mapped_column(
        String(64), nullable=False
    )
    mime_type: Mapped[str] = mapped_column(
        String(80), nullable=False
    )
    filename: Mapped[str] = mapped_column(
        String(255), nullable=False
    )
    sha256: Mapped[str] = mapped_column(
        String(64), nullable=False
    )
    content: Mapped[bytes] = mapped_column(
        LargeBinary, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )


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
    kind: str = Field(default='dealer', pattern='^(dealer|support)$')


class RevokeBody(BaseModel):
    public_id: str = Field(min_length=1, max_length=64)
    confirm_public_id: str = Field(min_length=1, max_length=64)


class StockBody(AssignBody):
    amount: int = Field(gt=0, le=MAX_STOCK)
    request_key: str = Field(min_length=16, max_length=64)


class TransferBody(BaseModel):
    recipient_public_id: str = Field(min_length=1, max_length=64)
    amount: int = Field(gt=0, le=MAX_STOCK)
    request_key: str = Field(min_length=16, max_length=64)
    evidence: str = Field(
        min_length=1, max_length=7_100_000
    )


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
    if not row or not row.active or designation(db, user.id) == 'coin':
        raise HTTPException(403, "Aktif LB / BT yetkiniz yok")
    return row




def require_role_cosmetics_unlocked(db, user_id):
    """Reject avatar/frame edits while a current LB or BT inventory is active.

    Keep original cosmetic fields unchanged; removing the role restores them.
    """
    row = db.scalar(select(DealerInventory).where(
        DealerInventory.user_id == user_id).with_for_update())
    if row is not None and row.active and designation(db, user_id) in ('dealer', 'support'):
        raise HTTPException(403, 'LB / BT yetkisi aktifken avatar ve çerçeve değiştirilemez')


def register_auth(current_user):
    install_referral_routes(router, current_user, require_da, require_dealer, designation, target_by_public_id)
    @router.get("/me")
    def my_dealership(db: Session = Depends(get_db), user: User = Depends(current_user)):
        row = require_dealer(db, user)
        kind = designation(db, user.id)
        return {"dealer": True, "public_id": user.public_id, "stock": row.stock,
                "badge": dealer_badge(kind), "kind": kind}

    @router.post("/representatives/heartbeat")
    def bt_heartbeat(db: Session = Depends(get_db), user: User = Depends(current_user)):
        require_dealer(db, user)
        if designation(db, user.id) != 'support':
            raise HTTPException(403, 'Yalnızca aktif Bayi Temsilcisi çevrimiçi sinyali verebilir')
        now = datetime.now(timezone.utc)
        row = db.get(DealerRepresentativePresence, user.id)
        if row is None:
            db.add(DealerRepresentativePresence(user_id=user.id, last_seen_at=now))
        else:
            row.last_seen_at = now
        db.commit()
        return {'ok': True}

    @router.get("/representatives")
    def list_representatives(db: Session = Depends(get_db), user: User = Depends(current_user)):
        # Only current LB/BT accounts can discover representatives.
        require_dealer(db, user)
        rows = db.execute(
            select(User, DealerRepresentativePresence.last_seen_at)
            .join(DealerInventory, DealerInventory.user_id == User.id)
            .join(DealerDesignation, DealerDesignation.user_id == User.id)
            .outerjoin(DealerRepresentativePresence, DealerRepresentativePresence.user_id == User.id)
            .where(User.is_active.is_(True), DealerInventory.active.is_(True),
                   DealerDesignation.kind == 'support')
            .order_by(User.public_id)
            .limit(500)
        ).all()
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(seconds=90)
        result = []
        for person, stamp in rows:
            if stamp is not None and stamp.tzinfo is None:
                stamp = stamp.replace(tzinfo=timezone.utc)
            result.append({
                'user_id': person.id, 'public_id': person.public_id,
                'nickname': person.nickname,
                'online': bool(stamp and stamp >= cutoff),
            })
        result.sort(key=lambda item: (not item['online'], str(item['nickname']).casefold()))
        return {'items': result, 'online_count': sum(item['online'] for item in result)}


    @router.get("/representatives/mine")
    def my_representatives(
        db: Session = Depends(get_db),
        user: User = Depends(current_user)
    ):
        require_dealer(db, user)

        if designation(db, user.id) != "dealer":
            raise HTTPException(
                403, "Yalnızca Lidya Bayileri erişebilir"
            )

        link = db.get(LBReferral, user.id)

        if link is None:
            return {"items": [], "online_count": 0}

        person = db.get(User, link.bt_user_id)
        inventory = db.get(
            DealerInventory, link.bt_user_id
        )

        if not person or not person.is_active:
            return {"items": [], "online_count": 0}

        if not inventory or not inventory.active:
            return {"items": [], "online_count": 0}

        if designation(db, person.id) != "support":
            return {"items": [], "online_count": 0}

        presence = db.get(
            DealerRepresentativePresence, person.id
        )

        stamp = (
            presence.last_seen_at if presence else None
        )

        if stamp is not None and stamp.tzinfo is None:
            stamp = stamp.replace(
                tzinfo=timezone.utc
            )

        online = bool(
            stamp and stamp >= (
                datetime.now(timezone.utc)
                - timedelta(seconds=90)
            )
        )

        return {
            "items": [{
                "public_id": person.public_id,
                "nickname": person.nickname,
                "online": online
            }],
            "online_count": int(online)
        }

    @router.get("/badges")
    def badges(ids: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
        keys = list(dict.fromkeys(x.strip() for x in ids.split(",") if x.strip()))
        if len(keys) > 100 or any(len(x) > 64 for x in keys):
            raise HTTPException(400, "En fazla 100 ID sorgulanabilir")
        rows = db.scalars(select(DealerInventory.user_id).where(DealerInventory.user_id.in_(keys), DealerInventory.active.is_(True))).all()
        explicit = db.scalars(select(DealerDesignation).where(
            DealerDesignation.user_id.in_(rows))).all() if rows else []
        kinds = {r.user_id: r.kind for r in explicit}
        # Legacy CT assignments must be explicitly reviewed by DA.
        visible = [uid for uid in rows if kinds.get(uid, 'dealer') != 'coin']
        return {"dealers": visible, "roles": {uid: kinds.get(uid, 'dealer') for uid in visible}}

    @router.get("/admin/list")
    def admin_dealer_list(limit: int = Query(default=50, ge=1, le=100),
                          db: Session = Depends(get_db), user: User = Depends(current_user)):
        require_da(db, user)
        rows = db.execute(select(DealerInventory, User)
            .join(User, User.id == DealerInventory.user_id)
            .order_by(DealerInventory.created_at.desc()).limit(limit)).all()
        return {"items": [{"public_id": person.public_id, "nickname": person.nickname,
            "stock": inv.stock, "active": inv.active, "kind": designation(db, person.id)} for inv, person in rows]}

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
            "active": inv.active, "stock": inv.stock, "kind": designation(db, person.id),
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
        identity = db.get(DealerDesignation, target.id)
        if body.kind == 'dealer':
            if identity is not None:
                db.delete(identity)
            db.commit()
            return {"ok": True, "public_id": target.public_id, "badge": "LB",
                    "kind": "dealer", "stock": row.stock if row else 0}
        if identity is None:
            db.add(DealerDesignation(user_id=target.id, kind=body.kind, assigned_by=user.id))
        else:
            identity.kind = body.kind
            identity.assigned_by = user.id
            identity.updated_at = datetime.now(timezone.utc)
        # Provision a permanent code when BT role is assigned. Reassignment never rotates it.
        if body.kind == 'support':
            ensure_bt_referral(db, target.id)
        db.commit()
        return {"ok": True, "public_id": target.public_id, "badge": dealer_badge(body.kind),
                "kind": body.kind, "stock": row.stock if row else 0}

    @router.post("/admin/revoke")
    def revoke(body: RevokeBody, db: Session = Depends(get_db), user: User = Depends(current_user)):
        require_da(db, user)
        if body.public_id.strip() != body.confirm_public_id.strip():
            raise HTTPException(422, "Profil ID onayı eşleşmiyor")
        person = target_by_public_id(db, body.public_id)
        row = db.scalar(select(DealerInventory).where(
            DealerInventory.user_id == person.id).with_for_update())
        if row is None or not row.active:
            raise HTTPException(404, "Aktif bayi/temsilci yetkisi bulunamadı")
        # Preserve financial ledger and remaining stock; revoke access atomically.
        row.active = False
        identity = db.get(DealerDesignation, person.id)
        if identity is not None:
            db.delete(identity)
        db.commit()
        return {"ok": True, "public_id": person.public_id, "active": False,
                "preserved_stock": row.stock}

    @router.post("/admin/stock")
    def grant(body: StockBody, db: Session = Depends(get_db), user: User = Depends(current_user)):
        require_da(db, user)
        target = target_by_public_id(db, body.public_id)
        # Lock the dealer's inventory before reading the idempotency key.
        # Concurrent retries will see the committed original grant.
        row = db.scalar(select(DealerInventory).where(
            DealerInventory.user_id == target.id).with_for_update())
        if row is None or not row.active or designation(db, target.id) == 'coin':
            raise HTTPException(409, "Aktif LB / BT bulunamadı")
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
        # V3_5_REQUIRED_EVIDENCE
        evidence = validate_evidence(body.evidence)
        # Serialize attempts, including duplicate retries, against this stock row.
        dealer = require_dealer(db, user, lock=True)
        # LB must enter a BT code before stock transfers.
        if designation(db, user.id) == "dealer":
            if db.get(LBReferral, user.id) is None:
                raise HTTPException(403, "LB referans aktivasyonu gerekli")
        recipient = target_by_public_id(db, body.recipient_public_id)
        if recipient.id == user.id:
            raise HTTPException(400, "Bayi kendisine stok aktaramaz")
        prior = db.scalar(select(DealerTransfer).where(DealerTransfer.dealer_id == user.id,
                                                     DealerTransfer.request_key == body.request_key))
        if prior:
            if prior.recipient_id != recipient.id or prior.amount != body.amount:
                raise HTTPException(409, "İşlem anahtarı başka bir aktarımda kullanılmış")
            saved = db.get(DealerTransferEvidence, prior.id)
            if not saved or saved.sha256 != evidence["sha256"]:
                raise HTTPException(
                    409, "Islem dekontu uyusmuyor"
                )
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
        db.add(DealerTransferEvidence(
            transfer_id=tx.id,
            uploaded_by=user.id,
            mime_type=evidence["mime_type"],
            filename=(
                "dekont-" + tx.id +
                (".pdf" if evidence["mime_type"] == "application/pdf"
                 else ".png" if evidence["mime_type"] == "image/png"
                 else ".webp" if evidence["mime_type"] == "image/webp"
                 else ".jpg")
            ),
            sha256=evidence["sha256"],
            content=evidence["content"]
        ))
        try:
            db.commit()
        except Exception:
            db.rollback()
            raise
        return {"ok": True, "stock": stock, "recipient_public_id": recipient.public_id,
                "amount": body.amount, "transfer_id": tx.id, "replayed": False}



    @router.get("/transfers/{transfer_id}/evidence")
    def view_transfer_evidence(
        transfer_id: str,
        db: Session = Depends(get_db),
        user: User = Depends(current_user)
    ):
        tx = db.get(DealerTransfer, transfer_id)
        if tx is None:
            raise HTTPException(404, "Islem bulunamadi")

        if tx.dealer_id != user.id:
            linked = False

            if designation(db, user.id) == "support":
                require_dealer(db, user)
                linked = db.scalar(
                    select(LBReferral.user_id).where(
                        LBReferral.user_id == tx.dealer_id,
                        LBReferral.bt_user_id == user.id
                    )
                ) is not None

            if not linked:
                require_da(db, user)

        evidence = db.get(DealerTransferEvidence, tx.id)
        if evidence is None:
            raise HTTPException(404, "Yuklenen dekont bulunamadi")

        return Response(
            content=evidence.content,
            media_type=evidence.mime_type,
            headers={
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
                "Content-Security-Policy": "sandbox",
                "Content-Disposition": (
                    'attachment; filename="' +
                    evidence.filename + '"'
                )
            }
        )

    @router.get("/transfers/{transfer_id}/receipt")
    def transfer_receipt(
        transfer_id: str,
        db: Session = Depends(get_db),
        user: User = Depends(current_user)
    ):
        tx = db.get(DealerTransfer, transfer_id)

        if tx is None:
            raise HTTPException(404, "Dekont bulunamadı")

        if tx.dealer_id != user.id:
            linked = None
            if designation(db, user.id) == "support":
                require_dealer(db, user)
                linked = db.scalar(
                    select(LBReferral.user_id).where(
                        LBReferral.user_id == tx.dealer_id,
                        LBReferral.bt_user_id == user.id
                    )
                )
            if not linked:
                require_da(db, user)

        sender = db.get(User, tx.dealer_id)
        recipient = db.get(User, tx.recipient_id)

        return {
            "ok": True,
            "receipt": {
                "transaction_id": tx.id,
                "kind": "lidya_transfer",
                "sender_public_id": (
                    sender.public_id if sender else None
                ),
                "recipient_public_id": (
                    recipient.public_id if recipient else None
                ),
                "amount": tx.amount,
                "created_at": tx.created_at.isoformat(),
                "status": "completed"
            }
        }


    @router.get("/representatives/team-history")
    def representative_team_history(
        public_id: str = Query(min_length=1, max_length=64),
        page: int = Query(default=1, ge=1),
        db: Session = Depends(get_db),
        user: User = Depends(current_user)
    ):
        require_dealer(db, user)
        if designation(db, user.id) != "support":
            raise HTTPException(403, "BT yetkisi gerekli")

        lb_id = db.scalar(
            select(User.id)
            .join(LBReferral, LBReferral.user_id == User.id)
            .where(
                User.public_id == public_id,
                LBReferral.bt_user_id == user.id
            )
        )
        if not lb_id:
            raise HTTPException(404, "Bagli bayi bulunamadi")

        condition = DealerTransfer.dealer_id == lb_id
        total = int(db.scalar(
            select(func.count())
            .select_from(DealerTransfer)
            .where(condition)
        ) or 0)

        rows = db.scalars(
            select(DealerTransfer)
            .where(condition)
            .order_by(
                DealerTransfer.created_at.desc(),
                DealerTransfer.id.desc()
            )
            .offset((page - 1) * 20)
            .limit(20)
        ).all()

        ids = [t.recipient_id for t in rows]
        people = {
            p.id: p.public_id
            for p in db.scalars(
                select(User).where(User.id.in_(ids))
            ).all()
        } if ids else {}

        return {
            "items": [{
                "id": t.id,
                "dealer_public_id": public_id,
                "recipient_public_id": people.get(
                    t.recipient_id, "—"
                ),
                "amount": t.amount,
                "created_at": t.created_at.isoformat(),
                "receipt_available": True
            } for t in rows],
            "page": page,
            "page_size": 20,
            "total": total,
            "total_pages": (total + 19) // 20
        }

    @router.get("/history")
    def history(page: int = Query(default=1, ge=1, le=1_000_000),
                db: Session = Depends(get_db), user: User = Depends(current_user)):
        require_dealer(db, user)
        condition = DealerTransfer.dealer_id == user.id
        total = int(db.scalar(select(func.count()).select_from(DealerTransfer).where(condition)) or 0)
        rows = db.scalars(select(DealerTransfer).where(condition)
            .order_by(DealerTransfer.created_at.desc(), DealerTransfer.id.desc())
            .offset((page - 1) * 20).limit(20)).all()
        recipient_ids = [r.recipient_id for r in rows]
        people = {p.id: p.public_id for p in db.scalars(select(User)
            .where(User.id.in_(recipient_ids))).all()} if recipient_ids else {}
        return {"items": [{"kind": "transfer", "id": t.id,
                    "dealer_public_id": user.public_id,
                    "actor_public_id": user.public_id,
                    "recipient_public_id": people.get(t.recipient_id, "—"),
                    "amount": t.amount, "created_at": t.created_at.isoformat()}
                    for t in rows], "page": page, "page_size": 20,
                "total": total, "total_pages": (total + 19) // 20}


    @router.get("/admin/representative-link")
    def admin_representative_link(
        public_id: str = Query(min_length=1, max_length=64),
        db: Session = Depends(get_db),
        user: User = Depends(current_user)
    ):
        require_da(db, user)

        lb = target_by_public_id(db, public_id)
        if not db.get(DealerInventory, lb.id):
            raise HTTPException(404, "Bayi bulunamadi")

        link = db.get(LBReferral, lb.id)
        if not link:
            return {"items": [], "online_count": 0}

        bt = db.get(User, link.bt_user_id)
        if not bt:
            return {"items": [], "online_count": 0}

        presence = db.get(
            DealerRepresentativePresence, bt.id
        )

        stamp = presence.last_seen_at if presence else None
        if stamp is not None and stamp.tzinfo is None:
            stamp = stamp.replace(tzinfo=timezone.utc)

        inventory = db.get(DealerInventory, bt.id)
        active = bool(
            bt.is_active and inventory
            and inventory.active
            and designation(db, bt.id) == "support"
        )

        online = bool(
            active and stamp
            and stamp >= datetime.now(timezone.utc)
            - timedelta(seconds=90)
        )

        return {
            "items": [{
                "public_id": bt.public_id,
                "nickname": bt.nickname,
                "active": active,
                "online": online,
                "activated_at": link.activated_at.isoformat()
            }],
            "online_count": int(online)
        }

    @router.get("/admin/history")
    def admin_dealer_history(public_id: str = Query(min_length=1, max_length=64),
                             page: int = Query(default=1, ge=1, le=1_000_000),
                             db: Session = Depends(get_db), user: User = Depends(current_user)):
        require_da(db, user)
        person = target_by_public_id(db, public_id)
        if db.get(DealerInventory, person.id) is None:
            raise HTTPException(404, "Bu ID için bayi kaydı bulunamadı")
        grant_filter = DealerStockGrant.dealer_id == person.id
        transfer_filter = DealerTransfer.dealer_id == person.id
        grant_count = int(db.scalar(select(func.count()).select_from(DealerStockGrant).where(grant_filter)) or 0)
        transfer_count = int(db.scalar(select(func.count()).select_from(DealerTransfer).where(transfer_filter)) or 0)
        total = grant_count + transfer_count
        grants = select(literal("stock_grant").label("kind"), DealerStockGrant.id.label("id"),
            DealerStockGrant.amount.label("amount"), DealerStockGrant.created_at.label("created_at"),
            DealerStockGrant.admin_id.label("actor_id"),
            literal(None, type_=String(64)).label("recipient_id"),
            DealerStockGrant.request_key.label("request_key")).where(grant_filter)
        transfers = select(literal("transfer").label("kind"), DealerTransfer.id.label("id"),
            DealerTransfer.amount.label("amount"), DealerTransfer.created_at.label("created_at"),
            DealerTransfer.dealer_id.label("actor_id"), DealerTransfer.recipient_id.label("recipient_id"),
            DealerTransfer.request_key.label("request_key")).where(transfer_filter)
        combined = union_all(grants, transfers).subquery()
        rows = db.execute(select(combined).order_by(combined.c.created_at.desc(), combined.c.id.desc())
            .offset((page - 1) * 20).limit(20)).mappings().all()
        ids = list({x for row in rows for x in (row["actor_id"], row["recipient_id"]) if x})
        people = {p.id: p.public_id for p in db.scalars(select(User)
            .where(User.id.in_(ids))).all()} if ids else {}
        return {"items": [{"kind": r["kind"], "id": r["id"], "amount": r["amount"],
                "created_at": r["created_at"].isoformat(), "dealer_public_id": person.public_id,
                "actor_public_id": people.get(r["actor_id"], "—"),
                "recipient_public_id": people.get(r["recipient_id"], "—") if r["recipient_id"] else None,
                "request_key": r["request_key"]} for r in rows],
                "page": page, "page_size": 20, "total": total,
                "total_pages": (total + 19) // 20}

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
