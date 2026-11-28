from datetime import datetime
from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base

REFERRAL_CODE_LIMIT = 256


def widen_referral_code_column(conn):
    """Idempotent PostgreSQL widening; retain existing values and unique index."""
    if conn.dialect.name != 'postgresql':
        return
    width = conn.execute(text("SELECT atttypmod FROM pg_attribute WHERE attrelid = 'referral_codes'::regclass AND attname = 'code' AND NOT attisdropped")).scalar_one()
    if 0 < width < REFERRAL_CODE_LIMIT + 4:
        conn.execute(text(f'ALTER TABLE referral_codes ALTER COLUMN code TYPE VARCHAR({REFERRAL_CODE_LIMIT})'))


class ReferralCode(Base):
    __tablename__ = 'referral_codes'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(REFERRAL_CODE_LIMIT), unique=True, nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    max_uses: Mapped[int] = mapped_column(Integer, nullable=False)
    uses: Mapped[int] = mapped_column(Integer, default=0, server_default='0', nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default='true', nullable=False)
    created_by: Mapped[str] = mapped_column(ForeignKey('users.id'), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

class CustomReferralReward(Base):
    # Separate table: existing referral_codes rows and schema remain unchanged.
    __tablename__ = 'custom_referral_rewards_v1'
    code_id: Mapped[int] = mapped_column(ForeignKey('referral_codes.id', ondelete='CASCADE'), primary_key=True)
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)


class ReferralRedemption(Base):
    __tablename__ = 'referral_redemptions'
    __table_args__ = (UniqueConstraint('code_id', 'user_id', name='uq_referral_redemption'),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code_id: Mapped[int] = mapped_column(ForeignKey('referral_codes.id'), nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), nullable=False)
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

class FamilyReferralClaim(Base):
    __tablename__ = 'family_referral_claims'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    family_id: Mapped[str] = mapped_column(ForeignKey('families.id'), nullable=False, index=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey('users.id'), nullable=False)
    member_count: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

class FamilyReferralReceipt(Base):
    __tablename__ = 'family_referral_receipts'
    __table_args__ = (UniqueConstraint('claim_id', 'user_id', name='uq_family_referral_receipt'),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    claim_id: Mapped[int] = mapped_column(ForeignKey('family_referral_claims.id'), nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
