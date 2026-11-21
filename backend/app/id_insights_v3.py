"""DA-only account review analytics. Read-only queries, no message contents or IPs.

Counts reflect retained database records, not online presence or historical lifetime totals.
"""
from sqlalchemy import String, cast, func, literal, or_, select, union_all

from .models import User
from .platform_models import (
    VipStatus, FamilyMember, Family, UserFollow, SocialPost, SocialStory,
    SocialPostComment, GamePlay, GameBet, DirectCall, DirectMessageGift,
    ProfileVisit, UserBlock, Report,
)
from .room_models import Room, RoomMember, RoomFollow, RoomGiftEvent, RoomModerator, RoomBan
from .admin_models import UserBan, ChatBan, AdminAuditLog
from .vip_membership_models import VipMembership, VipPurchaseReceipt
from .referral_models import ReferralRedemption
from .purchase_models import LidyaOrder, LidyaOperation
from .play_billing_models import PlayPurchaseRecord
from .payment_assistance_models import PaymentRequest
from .dealer_routes import DealerTransfer

PAGE_SIZE = 20


def _count(db, model, condition):
    return int(db.scalar(select(func.count()).select_from(model).where(condition)) or 0)


def summary(db, person):
    uid = person.id
    member = db.execute(
        select(Family.name, FamilyMember.role, Family.id)
        .join(FamilyMember, FamilyMember.family_id == Family.id)
        .where(FamilyMember.user_id == uid)
        .order_by(FamilyMember.created_at.desc()).limit(5)
    ).all()
    owned = db.execute(
        select(Room.public_id, Room.name, Room.is_active)
        .where(Room.owner_id == uid)
        .order_by(Room.created_at.desc()).limit(10)
    ).all()
    membership = db.get(VipMembership, uid)
    vip = db.get(VipStatus, uid)

    return {
        'id': person.public_id,
        'social': {
            'followers': _count(db, UserFollow, UserFollow.following_id == uid),
            'following': _count(db, UserFollow, UserFollow.follower_id == uid),
            'stories_recorded': _count(db, SocialStory, SocialStory.user_id == uid),
            'posts_recorded': _count(db, SocialPost, SocialPost.user_id == uid),
            'comments_recorded': _count(db, SocialPostComment, SocialPostComment.user_id == uid),
            'profile_visit_records': _count(db, ProfileVisit, ProfileVisit.profile_user_id == uid),
            'blocked_users': _count(db, UserBlock, UserBlock.blocker_id == uid),
        },
        'rooms': {
            'owned': _count(db, Room, Room.owner_id == uid),
            'member_records': _count(db, RoomMember, RoomMember.user_id == uid),
            'followed_rooms': _count(db, RoomFollow, RoomFollow.user_id == uid),
            'moderator_records': _count(db, RoomModerator, RoomModerator.user_id == uid),
            'rooms': [{'public_id': r.public_id, 'name': r.name,
                       'active': bool(r.is_active)} for r in owned],
            'families': [{'id': f.id, 'name': f.name, 'role': f.role}
                         for f in member],
        },
        'games': {
            'bets_recorded': _count(db, GameBet, GameBet.user_id == uid),
            'plays_recorded': _count(db, GamePlay, GamePlay.user_id == uid),
        },
        'finance': {
            'orders_recorded': _count(db, LidyaOrder, LidyaOrder.user_id == uid),
            'play_receipts_recorded': _count(db, PlayPurchaseRecord, PlayPurchaseRecord.user_id == uid),
            'assisted_requests_recorded': _count(db, PaymentRequest, PaymentRequest.user_id == uid),
            'dealer_transfers_received': _count(db, DealerTransfer, DealerTransfer.recipient_id == uid),
            'manual_credits_recorded': _count(db, LidyaOperation, (LidyaOperation.user_id == uid) & (LidyaOperation.operation == 'EKLEME')),
            'vip_receipts_recorded': _count(db, VipPurchaseReceipt, VipPurchaseReceipt.user_id == uid),
            'referral_redemptions': _count(db, ReferralRedemption, ReferralRedemption.user_id == uid),
        },
        'vip': {
            'level': int(vip.level) if vip else 0,
            'earned_level': int(membership.earned_level) if membership else None,
            'cycle_start': membership.cycle_started_at.isoformat() if membership and membership.cycle_started_at else None,
            'cycle_end': membership.cycle_ends_at.isoformat() if membership and membership.cycle_ends_at else None,
            'cycle_purchased': str(membership.cycle_purchased) if membership else None,
            'total_purchased_recorded': str(membership.total_purchased) if membership else None,
        },
        'security': {
            'account_ban_records': _count(db, UserBan, UserBan.user_id == uid),
            'chat_ban_records': _count(db, ChatBan, ChatBan.user_id == uid),
            'room_ban_records': _count(db, RoomBan, RoomBan.user_id == uid),
            'reports_received': _count(db, Report, Report.target_user_id == uid),
            'reports_sent': _count(db, Report, Report.reporter_id == uid),
            'admin_audit_records': _count(db, AdminAuditLog, AdminAuditLog.target_user_id == uid),
        },
        'communication': {
            'calls_recorded': _count(db, DirectCall, or_(DirectCall.caller_id == uid, DirectCall.callee_id == uid)),
        },
        'note': 'Tüm sayılar saklanan kayıtları gösterir. Silinmiş veya süresi dolmuş veriler bu sayılara dahil olmayabilir; çevrimiçi durum gösterilmez.',
    }


def _event(id_value, ts, source, detail, amount=''):
    return select(
        cast(id_value, String).label('id'),
        ts.label('created_at'),
        literal(source).label('source'),
        cast(detail, String).label('detail'),
        cast(amount, String).label('amount'),
    )


def activity(db, uid, category, page):
    if category == 'social':
        statements = [
            _event(SocialPost.id, SocialPost.created_at, 'Keşfet paylaşımı', literal('Paylaşım oluşturuldu')).where(SocialPost.user_id == uid),
            _event(SocialStory.id, SocialStory.created_at, 'Story', literal('Story paylaşıldı')).where(SocialStory.user_id == uid),
            _event(SocialPostComment.id, SocialPostComment.created_at, 'Yorum', literal('Yorum kaydı')).where(SocialPostComment.user_id == uid),
            _event(UserFollow.id, UserFollow.created_at, 'Takip', literal('Kullanıcı takibi')).where(UserFollow.follower_id == uid),
        ]
    elif category == 'rooms':
        statements = [
            _event(Room.id, Room.created_at, 'Oda oluşturma', Room.name).where(Room.owner_id == uid),
            _event(RoomMember.id, RoomMember.joined_at, 'Oda üyeliği', literal('Üyelik kaydı')).where(RoomMember.user_id == uid),
            _event(RoomFollow.id, RoomFollow.created_at, 'Oda takibi', literal('Oda takip kaydı')).where(RoomFollow.user_id == uid),
        ]
    elif category == 'gifts':
        statements = [
            _event(RoomGiftEvent.id, RoomGiftEvent.created_at, 'Odada gönderilen hediye', RoomGiftEvent.gift_key, RoomGiftEvent.total_price).where(RoomGiftEvent.sender_id == uid),
            _event(RoomGiftEvent.id, RoomGiftEvent.created_at, 'Odada alınan hediye', RoomGiftEvent.gift_key, RoomGiftEvent.recipient_amount).where(RoomGiftEvent.recipient_id == uid),
            _event(DirectMessageGift.message_id, DirectMessageGift.created_at, 'DM gönderilen hediye', DirectMessageGift.gift_key, DirectMessageGift.unit_price).where(DirectMessageGift.sender_id == uid),
            _event(DirectMessageGift.message_id, DirectMessageGift.created_at, 'DM alınan hediye', DirectMessageGift.gift_key, DirectMessageGift.recipient_amount).where(DirectMessageGift.recipient_id == uid),
        ]
    elif category == 'moderation':
        statements = [
            _event(UserBan.id, UserBan.created_at, 'Hesap yaptırımı', UserBan.ban_type).where(UserBan.user_id == uid),
            _event(ChatBan.id, ChatBan.created_at, 'Sohbet yaptırımı', literal('Sohbet kısıtlama kaydı')).where(ChatBan.user_id == uid),
            _event(RoomBan.id, RoomBan.created_at, 'Oda yaptırımı', literal('Oda yasağı kaydı')).where(RoomBan.user_id == uid),
            _event(AdminAuditLog.id, AdminAuditLog.created_at, 'Yönetici kaydı', AdminAuditLog.action).where(AdminAuditLog.target_user_id == uid),
        ]
    else:
        raise ValueError('Geçersiz etkinlik kategorisi')
    combined = union_all(*statements).subquery('account_activity')
    total = int(db.scalar(select(func.count()).select_from(combined)) or 0)
    rows = db.execute(
        select(combined).order_by(combined.c.created_at.desc(), combined.c.id.desc())
        .offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE)
    ).all()
    return {
        'category': category, 'page': page, 'page_size': PAGE_SIZE,
        'total': total,
        'total_pages': max(1, (total + PAGE_SIZE - 1) // PAGE_SIZE),
        'has_previous': page > 1, 'has_next': page * PAGE_SIZE < total,
        'items': [
            {'id': row.id, 'created_at': row.created_at.isoformat() if hasattr(row.created_at, 'isoformat') else str(row.created_at) if row.created_at else None,
             'source': row.source, 'detail': row.detail, 'amount': row.amount}
            for row in rows
        ],
    }
