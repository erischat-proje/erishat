"""Authorized nobility appearance in social follow lists."""

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

    rank = active_rank(db, target_id, at)

    if rank not in (1, 2, 3, 4):
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

    from .nobility_collection import disabled_privileges

    disabled = disabled_privileges(db, target_id, rank)

    if rank == 4:
        from .nobility_appearance import public_appearance

        appearance = public_appearance(db, target_id, at)
        appearance["privileges"] = [
            key for key in appearance["privileges"]
            if key in ("badge", "frame", "super_avatar")
        ]
        return appearance

    return {
        "rank": rank,
        "privileges": [
            key for key in ("badge", "frame")
            if key not in disabled
        ],
    }


def knight_follow_appearances(
    db, viewer_id, target_ids, at
):
    """Batch authorization for all nobility ranks."""

    from datetime import datetime, timezone
    from sqlalchemy.orm import aliased

    from .nobility_policy import enabled, effective_rank
    from .nobility_config import get_rank_rule
    from .nobility_models import (
        NobilityMembership,
        NobilityRankConfig,
    )
    from .admin_models import UserBan
    from .models import User
    from .nobility_avatar_models import NobilityAnimatedAvatar
    from .nobility_policy import utc
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

    from .nobility_collection import (
        visual_disabled_expression,
    )

    avatar = NobilityAnimatedAvatar

    query = (
        select(
            member,
            config,
            User.gender,
            avatar.asset_id,
            avatar.expires_at,
            visual_disabled_expression(
                member, "super_avatar"
            ).label("super_avatar_disabled"),
            visual_disabled_expression(
                member, "badge"
            ).label("badge_disabled"),
            visual_disabled_expression(
                member, "frame"
            ).label("frame_disabled"),
        )
        .join(config, config.rank == member.rank)
        .join(User, User.id == member.user_id)
        .outerjoin(
            avatar,
            and_(
                avatar.user_id == member.user_id,
                avatar.granted_at <= at,
                avatar.expires_at > at,
            ),
        )
        .where(
            uid.in_(ids),
            User.is_active.is_(True),
            member.rank.in_((1, 2, 3, 4)),
            config.enabled.is_(True),
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

    for (
        row, cfg, gender, asset_id, avatar_expiry,
        super_off, badge_off, frame_off,
    ) in db.execute(query):
        rank = effective_rank(row, at)

        if rank not in (1, 2, 3, 4):
            continue

        rule = get_rank_rule(rank)

        if (
            cfg.required_points != rule.required_points
            or cfg.renewal_points != rule.renewal_points
            or cfg.duration_days != rule.duration_days
        ):
            continue

        if rank in (1, 2, 3, 4):
            result[row.user_id] = {
                "rank": rank,
                "privileges": [
                    key for key, disabled in (
                        ("badge", badge_off),
                        ("frame", frame_off),
                    )
                    if not disabled
                ],
            }

        if rank == 4:
            entry = result[row.user_id]
            expiry = utc(row.expires_at)

            entry["king_expires_at"] = (
                expiry.isoformat() if expiry else None
            )

            if not super_off:
                entry["privileges"].append("super_avatar")
                entry["king_avatar_variant"] = (
                    gender if gender in ("male", "female")
                    else None
                )

                if asset_id and avatar_expiry:
                    entry["animated_avatar"] = {
                        "asset_id": asset_id,
                        "expires_at": utc(avatar_expiry).isoformat(),
                    }

    return result


def royal_appearance_map(db, viewer_id, user_ids):
    from datetime import datetime, timezone

    appearances = knight_follow_appearances(
        db, viewer_id, user_ids,
        datetime.now(timezone.utc),
    )

    return {
        uid: data
        for uid, data in appearances.items()
        if data.get("rank") == 4
    }


def royal_room_audience(db, sender_id, viewer_ids):
    """Resolve one King portrait for authorized room viewers."""

    viewers = {uid for uid in viewer_ids if uid}

    if not sender_id or not viewers:
        return None, set()

    data = royal_appearance_map(
        db, sender_id, [sender_id]
    ).get(sender_id)

    if not data:
        return None, set()

    blocked = db.execute(
        select(
            UserBlock.blocker_id,
            UserBlock.blocked_id,
        ).where(or_(
            and_(
                UserBlock.blocker_id == sender_id,
                UserBlock.blocked_id.in_(viewers),
            ),
            and_(
                UserBlock.blocked_id == sender_id,
                UserBlock.blocker_id.in_(viewers),
            ),
        ))
    )

    for blocker, blocked_id in blocked:
        viewers.discard(
            blocked_id if blocker == sender_id
            else blocker
        )

    privacy = db.get(
        PrivateProfileSetting, sender_id
    )

    if privacy and privacy.is_private:
        followers = set(db.scalars(
            select(UserFollow.follower_id).where(
                UserFollow.following_id == sender_id,
                UserFollow.follower_id.in_(viewers),
            )
        ))
        viewers &= followers | {sender_id}

    return data, viewers
