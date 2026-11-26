"""Authorized Knight appearance in social follow lists."""

from sqlalchemy import select, or_, and_

from .nobility_policy import active_rank
from .platform_models import (
    UserBlock, UserFollow, PrivateProfileSetting,
)
from .admin_models import AdminRole
from .moderation import active_ban


def knight_follow_appearance(db, viewer_id, target_id, at):
    empty = {"rank": 0, "privileges": []}

    if not viewer_id or not target_id:
        return empty

    if active_rank(db, target_id, at) != 1:
        return empty

    admin = db.get(AdminRole, target_id)

    if admin and admin.role in ("SA", "UA", "FA", "DA"):
        return empty

    if active_ban(db, target_id):
        return empty

    blocked = db.scalar(
        select(UserBlock.id).where(or_(
            and_(
                UserBlock.blocker_id == viewer_id,
                UserBlock.blocked_id == target_id,
            ),
            and_(
                UserBlock.blocker_id == target_id,
                UserBlock.blocked_id == viewer_id,
            ),
        )).limit(1)
    )

    if blocked:
        return empty

    privacy = db.get(PrivateProfileSetting, target_id)

    if (
        privacy and privacy.is_private
        and viewer_id != target_id
    ):
        following = db.scalar(
            select(UserFollow.id).where(
                UserFollow.follower_id == viewer_id,
                UserFollow.following_id == target_id,
            ).limit(1)
        )

        if not following:
            return empty

    return {
        "rank": 1,
        "privileges": ["badge", "frame"],
    }


def knight_follow_appearances(
    db, viewer_id, target_ids, at
):
    """Batch authorization for Knight social appearances."""

    from datetime import datetime, timezone
    from sqlalchemy.orm import aliased

    from .nobility_policy import enabled, effective_rank
    from .nobility_config import get_rank_rule
    from .nobility_models import (
        NobilityMembership,
        NobilityRankConfig,
    )
    from .admin_models import UserBan
    from .ban_workflow_models import UserBrowserDevice

    ids = list(dict.fromkeys(
        uid for uid in target_ids if uid
    ))

    result = {
        uid: {"rank": 0, "privileges": []}
        for uid in ids
    }

    if not viewer_id or not ids or not enabled():
        return result

    rule = get_rank_rule(1)
    member = NobilityMembership
    config = NobilityRankConfig
    uid = member.user_id

    now = datetime.now(timezone.utc)

    staff = select(AdminRole.user_id).where(
        AdminRole.user_id == uid,
        AdminRole.role.in_(("SA", "UA", "FA", "DA")),
    ).correlate(member).exists()

    blocked = select(UserBlock.id).where(or_(
        and_(
            UserBlock.blocker_id == viewer_id,
            UserBlock.blocked_id == uid,
        ),
        and_(
            UserBlock.blocker_id == uid,
            UserBlock.blocked_id == viewer_id,
        ),
    )).correlate(member).exists()

    private = select(PrivateProfileSetting.user_id).where(
        PrivateProfileSetting.user_id == uid,
        PrivateProfileSetting.is_private.is_(True),
    ).correlate(member).exists()

    following = select(UserFollow.id).where(
        UserFollow.follower_id == viewer_id,
        UserFollow.following_id == uid,
    ).correlate(member).exists()

    live_ban = and_(
        UserBan.active.is_(True),
        or_(
            UserBan.expires_at.is_(None),
            UserBan.expires_at > now,
        ),
    )

    direct_ban = select(UserBan.id).where(
        UserBan.user_id == uid,
        live_ban,
    ).correlate(member).exists()

    target_device = aliased(UserBrowserDevice)
    banned_device = aliased(UserBrowserDevice)

    device_ban = (
        select(UserBan.id)
        .select_from(target_device)
        .join(
            banned_device,
            banned_device.device_hash
            == target_device.device_hash,
        )
        .join(
            UserBan,
            UserBan.user_id == banned_device.user_id,
        )
        .where(
            target_device.user_id == uid,
            UserBan.ban_type == "device",
            live_ban,
        )
        .correlate(member)
        .exists()
    )

    query = (
        select(member)
        .join(config, config.rank == member.rank)
        .where(
            uid.in_(ids),
            member.rank == 1,
            config.enabled.is_(True),
            config.required_points == rule.required_points,
            config.renewal_points == rule.renewal_points,
            config.duration_days == rule.duration_days,
            ~staff,
            ~blocked,
            ~direct_ban,
            ~device_ban,
            or_(
                ~private,
                uid == viewer_id,
                following,
            ),
        )
        .execution_options(populate_existing=True)
    )

    for row in db.scalars(query):
        if effective_rank(row, at) == 1:
            result[row.user_id] = {
                "rank": 1,
                "privileges": ["badge", "frame"],
            }

    return result
