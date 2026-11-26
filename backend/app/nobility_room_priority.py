"""Server-authorized room nobility priority."""

from .nobility_policy import active_rank


def member_nobility(db, user_id, at):
    rank = active_rank(db, user_id, at)

    if type(rank) is not int or rank not in (1, 2, 3, 4):
        return {"rank": 0, "privileges": []}

    from .nobility_collection import disabled_privileges

    disabled = disabled_privileges(db, user_id, rank)

    return {
        "rank": rank,
        "privileges": (
            [] if "badge" in disabled else ["badge"]
        ),
    }


def order_room_members(rows):
    def priority(row):
        data = row.get("nobility") or {}
        rank = data.get("rank", 0)

        if type(rank) is int and rank in (1, 2, 3, 4):
            return rank

        return 0

    return sorted(rows, key=priority, reverse=True)


def members_nobility(db, user_ids, at):
    """Batch room nobility authorization."""

    from sqlalchemy import select

    from .nobility_policy import enabled, effective_rank
    from .nobility_config import get_rank_rule
    from .nobility_models import (
        NobilityMembership,
        NobilityRankConfig,
    )

    ids = list(dict.fromkeys(
        uid for uid in user_ids if uid
    ))

    result = {
        uid: {"rank": 0, "privileges": []}
        for uid in ids
    }

    if not ids or not enabled():
        return result

    from .nobility_collection import (
        visual_disabled_expression,
    )

    query = (
        select(
            NobilityMembership,
            NobilityRankConfig,
            visual_disabled_expression(
                NobilityMembership, "badge"
            ).label("badge_disabled"),
        )
        .join(
            NobilityRankConfig,
            NobilityRankConfig.rank
            == NobilityMembership.rank,
        )
        .where(
            NobilityMembership.user_id.in_(ids),
            NobilityMembership.rank.in_((1, 2, 3, 4)),
            NobilityRankConfig.enabled.is_(True),
        )
        .execution_options(populate_existing=True)
    )

    for member, config, badge_off in db.execute(query):
        rank = effective_rank(member, at)

        if rank not in (1, 2, 3, 4):
            continue

        rule = get_rank_rule(rank)

        if (
            config.required_points != rule.required_points
            or config.renewal_points != rule.renewal_points
            or config.duration_days != rule.duration_days
        ):
            continue

        result[member.user_id] = {
            "rank": rank,
            "privileges": (
                [] if badge_off else ["badge"]
            ),
        }

    return result
