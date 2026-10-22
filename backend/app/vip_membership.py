"""30-day VIP engine. Only verified paid credits count; spending never raises VIP."""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from sqlalchemy.orm import Session
from .models import User
from .platform_models import VipStatus, Notification
from .vip_membership_models import VipMembership, VipPurchaseReceipt, VipCycleAudit

THRESHOLDS = {
    1: 4000,
    2: 15000,
    3: 40000,
    4: 90000,
    5: 180000,
    6: 350000,
    7: 700000,
    8: 1300000,
    9: 2300000,
    10: 4000000,
    11: 6500000,
    12: 10000000,
}
TARGETS = {n: amount // 20 for n, amount in THRESHOLDS.items()}
DURATION = timedelta(days=30)
log = logging.getLogger("erischat.vip-membership")


def now():
    return datetime.now(timezone.utc)


def utc(d):
    return d.replace(tzinfo=timezone.utc) if d and d.tzinfo is None else d


def level_for(amount):
    return max((n for n, x in THRESHOLDS.items() if amount >= x), default=0)


def _status(db, uid):
    row = db.get(VipStatus, uid)
    if row is None:
        row = VipStatus(user_id=uid, level=0, total_spent=0)
        db.add(row)
        db.flush()
    return row


def _initialize(db, uid, at, exclude=None):
    member = db.get(VipMembership, uid)
    if member:
        return member
    # Historical sums are paid orders only. Manual/admin adds and gifts are excluded.
    from .purchase_models import LidyaOrder
    from .payment_assistance_models import PaymentRequest

    paid = []
    for row in db.scalars(
        select(LidyaOrder).where(
            LidyaOrder.user_id == uid,
            LidyaOrder.status == "approved",
            LidyaOrder.transaction_reference.is_not(None),
        )
    ):
        paid.append(("order:" + row.id, int(row.total), utc(row.decided_at) or at))
    for row in db.scalars(
        select(PaymentRequest).where(
            PaymentRequest.user_id == uid,
            PaymentRequest.credit_operation_id.is_not(None),
            PaymentRequest.transaction_reference.is_not(None),
        )
    ):
        paid.append(("assisted:" + row.id, int(row.total), utc(row.updated_at) or at))
    paid = [x for x in paid if x[0] != exclude]
    total = sum(amount for _, amount, _ in paid)
    status = _status(db, uid)
    # Preserve an existing member's current tier for a full initial 30-day period.
    status.level = max(int(status.level or 0), level_for(total))
    member = VipMembership(
        user_id=uid,
        total_purchased=total,
        earned_level=status.level,
        cycle_started_at=at if status.level else None,
        cycle_ends_at=at + DURATION if status.level else None,
        cycle_purchased=0,
        migrated_at=at,
    )
    db.add(member)
    for key, amount, date in paid:
        db.add(
            VipPurchaseReceipt(user_id=uid, key=key, amount=amount, purchased_at=date)
        )
    db.flush()
    return member


def sync(db, uid, at=None, force_lock=False):
    at = at or now()
    member = db.get(VipMembership, uid)
    if (
        member
        and (not member.cycle_ends_at or utc(member.cycle_ends_at) > at)
        and not force_lock
    ):
        return member
    db.scalar(select(User.id).where(User.id == uid).with_for_update())
    member = db.get(VipMembership, uid)
    if member:
        db.refresh(member)
    status = db.get(VipStatus, uid)
    if status is not None:
        db.refresh(status)
    member = _initialize(db, uid, at)
    settle(db, member, at)
    return member


def settle(db, member, at):
    status = _status(db, member.user_id)
    starting_level = int(status.level or 0)
    while member.cycle_ends_at and utc(member.cycle_ends_at) <= at and status.level > 0:
        end = utc(member.cycle_ends_at)
        before = status.level
        target = TARGETS[before]
        purchased = int(member.cycle_purchased)
        if purchased < target:
            status.level -= 1
        db.add(
            VipCycleAudit(
                user_id=member.user_id,
                cycle_key=end.isoformat(),
                level_before=before,
                level_after=status.level,
                target=target,
                purchased=purchased,
                ended_at=end,
            )
        )
        if status.level < before:
            db.add(
                Notification(
                    user_id=member.user_id,
                    kind="vip_downgrade",
                    title="VIP dönemin tamamlandı",
                    body=f"30 günlük {target:,} Lidya satın alma hedefi tamamlanmadığı için VIP {before} → VIP {status.level}. Yeni dönemin VIP merkezinde.",
                )
            )
        member.cycle_purchased = 0
        member.cycle_started_at = end if status.level else None
        member.cycle_ends_at = end + DURATION if status.level else None
    if status.level < starting_level:
        clear_locked_appearances(db, member.user_id, status.level)
    db.flush()


def clear_locked_appearances(db, uid, level):
    from .cosmetics import find_asset
    from .wallpapers import find as find_wallpaper

    user = db.get(User, uid)
    if not user:
        return
    for kind in ("avatar", "frame", "wallpaper"):
        key = getattr(user, kind + "_asset", None)
        if not key:
            continue
        try:
            item = find_wallpaper(key) if kind == "wallpaper" else find_asset(key, kind)
        except ValueError:
            item = None
        if item and int(item.get("vip_level") or 0) > level:
            setattr(user, kind + "_asset", None)
    status = _status(db, uid)
    key = status.entry_effect or ""
    if key.startswith("vip-entrance-"):
        try:
            required = int(key.rsplit("-", 1)[1])
        except ValueError:
            required = 99
        if required > level:
            status.entry_effect = None


def record_purchase(db, uid, amount, source, reference, at=None):
    if (
        source not in ("assisted", "order")
        or type(amount) is not int
        or amount <= 0
        or not reference
        or len(reference) > 80
    ):
        raise ValueError("Geçersiz doğrulanmış satın alma.")
    at = at or now()
    key = source + ":" + reference
    db.scalar(select(User.id).where(User.id == uid).with_for_update())
    status = db.get(VipStatus, uid)
    if status is not None:
        db.refresh(status)
    member = _initialize(db, uid, at, exclude=key)
    db.refresh(member)
    existing = db.get(VipPurchaseReceipt, (uid, key))
    if existing:
        if existing.amount != amount:
            raise ValueError("Satın alma kaydı tutarı değiştirilemez.")
        return member
    settle(db, member, at)
    status = _status(db, uid)
    member.total_purchased += amount
    accumulated = member.cycle_purchased + amount
    new_earned = level_for(member.total_purchased)
    upgrade = status.level
    if new_earned > member.earned_level:
        upgrade = max(upgrade, new_earned)
    member.earned_level = max(member.earned_level, new_earned)
    # After a downgrade, old totals alone never silently restore the level.
    # New verified topups can restore tiers whose retention target is met.
    if status.level < member.earned_level:
        upgrade = max(
            upgrade,
            max(
                (
                    n
                    for n in range(status.level + 1, member.earned_level + 1)
                    if accumulated >= TARGETS[n]
                ),
                default=status.level,
            ),
        )
    if upgrade > status.level:
        previous = status.level
        status.level = upgrade
        member.cycle_started_at = at
        member.cycle_ends_at = at + DURATION
        member.cycle_purchased = amount
        db.add(
            Notification(
                user_id=uid,
                kind="vip_upgrade",
                title=f"VIP {upgrade} seviyesine ulaştın",
                body="30 günlük koruma süren yeniden başladı. Yükselten satın alımın yeni dönemin hedefine dahil edildi.",
            )
        )
    elif status.level:
        member.cycle_purchased = accumulated
    else:
        member.cycle_purchased = 0
    from .upload_rewards import notify_purchase
    notify_purchase(db, uid, amount, at)
    db.add(VipPurchaseReceipt(user_id=uid, key=key, amount=amount, purchased_at=at))
    db.flush()
    return member


def status_view(db, uid, at=None):
    at = at or now()
    m = sync(db, uid, at)
    s = _status(db, uid)
    level = int(s.level or 0)
    target = TARGETS.get(level, 0)
    end = utc(m.cycle_ends_at)
    return {
        "level": level,
        "total_purchased": int(m.total_purchased),
        "earned_level": m.earned_level,
        "basis": "verified_lidya_purchase",
        "cycle_started_at": (
            utc(m.cycle_started_at).isoformat() if m.cycle_started_at else None
        ),
        "cycle_ends_at": end.isoformat() if end else None,
        "cycle_purchased": int(m.cycle_purchased),
        "retention_target": target,
        "retention_remaining": max(0, target - m.cycle_purchased),
        "retention_met": bool(level and m.cycle_purchased >= target),
        "seconds_remaining": max(0, int((end - at).total_seconds())) if end else 0,
        "next_level": level + 1 if level < 12 else None,
        "next_level_purchased": THRESHOLDS.get(level + 1),
        "recovery_level": level + 1 if level < m.earned_level else None,
        "recovery_target": TARGETS.get(level + 1, 0) if level < m.earned_level else 0,
        "recovery_remaining": (
            max(0, TARGETS.get(level + 1, 0) - m.cycle_purchased)
            if level < m.earned_level
            else 0
        ),
        "thresholds": [
            {"level": n, "total": x, "retention": TARGETS[n]}
            for n, x in THRESHOLDS.items()
        ],
        "maintenance_fee": 0,
        "cycle_days": 30,
    }


def process_due(engine, batch=100):
    from sqlalchemy import or_

    # Keyset pagination makes every legacy VIP reachable; settled level-0 users
    # do not repeatedly occupy the first batch.
    cursor = ""
    while True:
        with Session(engine) as db:
            ids = list(
                db.scalars(
                    select(User.id)
                    .join(VipStatus, VipStatus.user_id == User.id)
                    .outerjoin(VipMembership, VipMembership.user_id == User.id)
                    .where(
                        User.id > cursor,
                        or_(
                            VipMembership.user_id.is_(None),
                            VipMembership.cycle_ends_at <= now(),
                        ),
                    )
                    .order_by(User.id)
                    .limit(batch)
                )
            )
        if not ids:
            return
        for uid in ids:
            try:
                with Session(engine) as db:
                    sync(db, uid, force_lock=True)
                    db.commit()
            except Exception:
                log.exception("VIP period failed for one account")
        cursor = ids[-1]


async def renewal_loop(engine):
    while True:
        try:
            await asyncio.to_thread(process_due, engine)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("VIP renewal sweep failed")
        await asyncio.sleep(60)
