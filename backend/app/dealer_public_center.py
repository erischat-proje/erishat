"""Online LB discovery and verified-transfer reviews; does not touch dealer inventory."""
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, UniqueConstraint, func, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from .db import Base, get_db
from .dealer_routes import DealerInventory, DealerTransfer
from .models import User

router = APIRouter(prefix='/v1/dealer-center', tags=['LB temsilci merkezi'])
TR = ZoneInfo('Europe/Istanbul')
LIVENESS_SECONDS = 35


class DealerPresence(Base):
    __tablename__ = 'dealer_center_presence'
    dealer_id: Mapped[str] = mapped_column(String(64), ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class DealerReview(Base):
    __tablename__ = 'dealer_center_reviews'
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    transfer_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True)
    dealer_id: Mapped[str] = mapped_column(String(64), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    reviewer_id: Mapped[str] = mapped_column(String(64), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    speed: Mapped[int] = mapped_column(Integer, nullable=False)
    communication: Mapped[int] = mapped_column(Integer, nullable=False)
    reliability: Mapped[int] = mapped_column(Integer, nullable=False)
    satisfaction: Mapped[int] = mapped_column(Integer, nullable=False)
    local_day: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class ReviewBody(BaseModel):
    transfer_id: str = Field(min_length=1, max_length=36)
    speed: int = Field(ge=1, le=5)
    communication: int = Field(ge=1, le=5)
    reliability: int = Field(ge=1, le=5)
    satisfaction: int = Field(ge=1, le=5)


def require_lb(db, user):
    row = db.get(DealerInventory, user.id)
    if not row or not row.active or not user.is_active:
        raise HTTPException(403, 'Aktif LB yetkisi gerekli')
    return row


def register_auth(current_user):
    @router.post('/heartbeat')
    def heartbeat(db: Session = Depends(get_db), user: User = Depends(current_user)):
        require_lb(db, user)
        now = datetime.now(timezone.utc)
        presence = db.get(DealerPresence, user.id)
        if presence is None:
            db.add(DealerPresence(dealer_id=user.id, seen_at=now))
        else:
            presence.seen_at = now
        db.commit()
        return {'ok': True, 'expires_in_seconds': LIVENESS_SECONDS}

    @router.post('/offline')
    def offline(db: Session = Depends(get_db), user: User = Depends(current_user)):
        require_lb(db, user)
        presence = db.get(DealerPresence, user.id)
        if presence is not None:
            db.delete(presence)
            db.commit()
        return {'ok': True}

    @router.get('/online')
    def online(db: Session = Depends(get_db), user: User = Depends(current_user)):
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(seconds=LIVENESS_SECONDS)
        today = now.astimezone(TR).date()
        active = db.execute(select(User, DealerPresence)
            .join(DealerInventory, DealerInventory.user_id == User.id)
            .join(DealerPresence, DealerPresence.dealer_id == User.id)
            .where(DealerInventory.active.is_(True), User.is_active.is_(True), DealerPresence.seen_at >= cutoff)).all()
        dealer_ids = [person.id for person, _ in active]
        review_counts = {}
        if dealer_ids:
            reviews = db.scalars(select(DealerReview)
                .where(DealerReview.dealer_id.in_(dealer_ids), DealerReview.local_day == today)).all()
            for r in reviews:
                review_counts.setdefault(r.dealer_id, []).append((r.speed+r.communication+r.reliability+r.satisfaction)/4)
        items = []
        for person, presence in active:
            ratings = review_counts.get(person.id, [])
            count = len(ratings)
            avg = sum(ratings)/count if count else 0
            # Bayesian score: avoids a single 5-star vote unfairly dominating.
            score = (sum(ratings) + 3.5 * 5) / (count + 5)
            items.append({'user_id': person.id, 'public_id': person.public_id,
                          'nickname': person.nickname, 'avatar': person.avatar,
                          'review_count': count, 'rating': round(avg, 2) if count else None,
                          'rank_score': round(score, 4), 'online': True})
        items.sort(key=lambda x: (-x['rank_score'], -x['review_count'], x['public_id']))
        return {'items': items, 'day': today.isoformat(), 'refresh_seconds': 5}

    @router.get('/reviewable')
    def reviewable(dealer_id: str = Query(min_length=1, max_length=64),
                   db: Session = Depends(get_db), user: User = Depends(current_user)):
        # Display ONLY actual dealer transfers made to this user.
        transfers = db.scalars(select(DealerTransfer)
            .where(DealerTransfer.dealer_id == dealer_id, DealerTransfer.recipient_id == user.id)
            .order_by(DealerTransfer.created_at.desc()).limit(50)).all()
        ids = [t.id for t in transfers]
        rated = set(db.scalars(select(DealerReview.transfer_id).where(DealerReview.transfer_id.in_(ids))).all()) if ids else set()
        return {'items': [{'transfer_id': t.id, 'amount': t.amount, 'created_at': t.created_at.isoformat() if t.created_at else None}
                          for t in transfers if t.id not in rated]}

    @router.post('/reviews', status_code=201)
    def review(body: ReviewBody, db: Session = Depends(get_db), user: User = Depends(current_user)):
        transfer = db.get(DealerTransfer, body.transfer_id)
        if transfer is None or transfer.recipient_id != user.id or transfer.dealer_id == user.id:
            raise HTTPException(403, 'Yalnızca size yapılan gerçek LB aktarımını değerlendirebilirsiniz')
        if db.scalar(select(DealerReview.id).where(DealerReview.transfer_id == transfer.id)):
            raise HTTPException(409, 'Bu aktarım zaten değerlendirildi')
        now = datetime.now(timezone.utc)
        db.add(DealerReview(id=str(uuid4()), transfer_id=transfer.id,
                            dealer_id=transfer.dealer_id, reviewer_id=user.id,
                            speed=body.speed, communication=body.communication,
                            reliability=body.reliability, satisfaction=body.satisfaction,
                            local_day=now.astimezone(TR).date(), created_at=now))
        try:
            db.commit()
        except Exception:
            db.rollback()
            raise HTTPException(409, 'Bu aktarım zaten değerlendirildi')
        return {'ok': True}

    return router
