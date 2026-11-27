"""API and persistence tests for real VIP benefits (SQLite isolated database)."""

import os, sys, unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

os.environ["DATABASE_URL"] = "sqlite://"
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app import vip_privileges as v
from app.room_models import Room
from app.platform_models import SocialPost
from app import (
    admin_models,
    nobility_models,
    shop_expansion,
    dealer_routes,
    support_models,
    chat_ban_models,
    ban_workflow_models,
    vip_spending,
    relationship_models,
    purchase_models,
    payment_assistance_models,
)


# PostgreSQL BigInteger identity compatibility for SQLite tests.
from sqlalchemy import BigInteger
from sqlalchemy.ext.compiler import compiles


@compiles(BigInteger, "sqlite")
def sqlite_bigint(type_, compiler, **kw):
    return "INTEGER"


# Register the real gift and ledger models before creating test tables.
from app import room_routes, system_data


class Benefits(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        v.Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine, expire_on_commit=False)()
        self.user = v.User(
            id="u",
            public_id="0000000001",
            nickname="Kaan",
            gender="male",
            lidya=12345,
        )
        self.friend = v.User(
            id="f",
            public_id="0000000002",
            nickname="Arkadaş",
            gender="female",
            lidya=0,
        )
        self.db.add_all([self.user, self.friend])
        self.db.flush()
        self.db.add(v.VipStatus(user_id="u", level=12, total_spent=10000000))
        self.db.commit()
        from app import cosmetic_routes

        app = FastAPI()
        app.include_router(v.router)
        app.include_router(cosmetic_routes.router)
        app.dependency_overrides[v.current_cosmetic_user] = lambda: self.user
        app.dependency_overrides[v.get_db] = lambda: self.db
        self.client = TestClient(app)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def request(self, path, method="GET", body=None):
        return self.client.request(method, "/v1/me/vip/benefits" + path, json=body)

    def select(self, key, value):
        return self.request("/selection", "PUT", {"key": key, "value": value})

    def test_catalog_has_all_levels_and_locks(self):
        r = self.request("").json()
        self.assertEqual(len(r["levels"]), 12)
        self.assertEqual({x["level"] for x in r["items"]}, set(range(1, 13)))
        self.assertNotIn("points", r)
        self.assertNotIn("daily_points", r)
        self.assertEqual(len(r["level_rewards"]), 12)
        self.db.get(v.VipStatus, "u").level = 1
        self.db.commit()
        self.assertEqual(self.select("royal_scene", "enabled").status_code, 403)
        self.assertEqual(
            self.select("name_gold", "url(javascript:bad)").status_code, 422
        )
        self.assertEqual(self.select("name_gold", "gold").status_code, 200)
        self.assertEqual(self.select("name_gold", None).status_code, 200)

    def test_daily_points_are_retired_and_cannot_be_claimed(self):
        for _ in range(2):
            self.assertEqual(self.request("/claim/daily", "POST", {}).status_code, 410)
        self.assertNotIn("points", self.request("").json())
        self.assertEqual(self.user.lidya, 12345)

    def test_periods_istanbul_monday_and_month_boundary(self):
        self.assertEqual(
            v.period("daily", datetime(2026, 10, 31, 21, 0, tzinfo=timezone.utc)),
            "2026-11-01",
        )
        self.assertEqual(
            v.period(
                "monthly_trial", datetime(2026, 10, 31, 21, 0, tzinfo=timezone.utc)
            ),
            "2026-11",
        )
        self.assertEqual(
            v.period(
                "weekly_trial", datetime(2026, 10, 18, 21, 0, tzinfo=timezone.utc)
            ),
            "2026-W43",
        )

    def test_trials_server_expiry_and_no_stacking(self):
        self.assertEqual(
            self.request(
                "/claim/monthly_trial", "POST", {"item": "trial-palace"}
            ).status_code,
            200,
        )
        lease = self.db.get(v.VipBenefitLease, ("u", "trial-palace"))
        expiry = v.utc(lease.expires_at)
        self.request("/claim/monthly_trial", "POST", {"item": "trial-palace"})
        self.assertEqual(v.utc(lease.expires_at), expiry)
        self.select("trial_scene", "trial-palace")
        self.assertIn("trial_scene", v.active(self.db, "u"))
        lease.expires_at = v.now() - timedelta(seconds=1)
        self.db.commit()
        self.assertNotIn("trial_scene", v.active(self.db, "u"))
        self.assertEqual(self.select("trial_scene", "trial-palace").status_code, 403)

    def test_points_shop_is_retired_and_direct_rewards_are_free(self):
        self.assertEqual(self.request("/shop/cover-sardis", "POST").status_code, 410)
        self.assertEqual(self.select("level_cover", "vip-level-03").status_code, 200)
        self.assertEqual(self.user.lidya, 12345)
        self.assertEqual(self.select("point_cover", "cover-sardis").status_code, 410)

    def test_coupon_one_transaction_and_no_effect_when_disabled(self):
        self.assertEqual(v.coupon_price(self.db, "u", 1000), 1000)
        self.select("coupon", "enabled")
        self.assertEqual(v.coupon_price(self.db, "u", 1000), 850)
        self.assertEqual(v.coupon_price(self.db, "u", 1000, consume=True), 850)
        self.db.commit()
        self.assertEqual(v.coupon_price(self.db, "u", 1000), 1000)
        self.assertEqual(self.user.lidya, 12345)

    def test_real_rental_applies_coupon_only_after_success(self):
        self.select("coupon", "enabled")

        payload = {
            "cosmetic_type": "avatar",
            "asset_key": "shop-expansion/avatar-male-01.png",
            "months": 1,
        }

        r = self.client.post("/v1/me/cosmetics/rent", json=payload)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["spent"], 2295)
        self.assertEqual(self.user.lidya, 10050)
        self.assertTrue(v.claimed(self.db, "u", "coupon"))

        first_expiry = datetime.fromisoformat(r.json()["expires_at"])

        r = self.client.post("/v1/me/cosmetics/rent", json=payload)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["spent"], 2700)
        self.assertEqual(self.user.lidya, 7350)
        self.assertGreater(
            datetime.fromisoformat(r.json()["expires_at"]),
            first_expiry,
        )

    def test_failed_rental_does_not_consume_coupon(self):
        self.select("coupon", "enabled")
        self.user.lidya = 0
        self.db.commit()

        r = self.client.post(
            "/v1/me/cosmetics/rent",
            json={
                "cosmetic_type": "avatar",
                "asset_key": "shop-expansion/avatar-male-01.png",
                "months": 1,
            },
        )

        self.assertEqual(r.status_code, 400, r.text)
        self.db.rollback()
        self.assertFalse(v.claimed(self.db, "u", "coupon"))

    def test_automatic_vip_inventory_v14(self):
        from app.cosmetic_routes import vip_level_rewards
        from app.platform_models import VipRewardClaim

        before = self.user.lidya
        expected = {
            (r["cosmetic_type"], r["asset_key"])
            for tier in vip_level_rewards(self.user)
            for r in tier["rewards"]
        }
        self.assertTrue(expected)

        for _ in range(2):
            response = self.client.get(
                "/v1/me/appearance-inventory"
            )
            self.assertEqual(
                response.status_code, 200, response.text
            )

        owned = [
            (r.cosmetic_type, r.asset_key)
            for r in self.db.scalars(
                select(v.UserCosmetic).where(
                    v.UserCosmetic.user_id == "u"
                )
            )
        ]

        self.assertTrue(expected.issubset(set(owned)))
        self.assertEqual(len(owned), len(set(owned)))

        claims = list(self.db.scalars(
            select(VipRewardClaim).where(
                VipRewardClaim.user_id == "u"
            )
        ))

        self.assertEqual(len(claims), 12)
        self.assertEqual(
            {r.level for r in claims},
            set(range(1, 13))
        )
        self.assertEqual(self.user.lidya, before)

    def test_vip_inventory_downgrade_v14(self):
        response = self.client.get(
            "/v1/me/appearance-inventory"
        )
        self.assertEqual(response.status_code, 200)

        self.db.get(v.VipStatus, "u").level = 5
        self.db.commit()

        response = self.client.get(
            "/v1/me/appearance-inventory"
        )
        self.assertEqual(
            response.status_code, 200, response.text
        )

        items = response.json()["items"]
        vip_items = [
            x for x in items if x.get("source") == "vip"
        ]
        self.assertTrue(vip_items)
        self.assertTrue(all(
            int(x.get("level") or 0) <= 5
            for x in vip_items
        ))
        self.assertEqual(self.user.lidya, 12345)

    def test_vip_cover_conflict_v15(self):
        self.assertEqual(
            self.select("level_cover", "vip-level-06").status_code,
            200,
        )
        self.assertEqual(
            self.select("cover", "sardis").status_code,
            200,
        )
        active = v.active(self.db, "u")
        self.assertNotIn("level_cover", active)
        self.assertEqual(active["cover"], "sardis")

        self.select("level_cover", "vip-level-03")
        active = v.active(self.db, "u")
        self.assertNotIn("cover", active)
        self.assertIn("level_cover", active)

    def test_vip_scene_conflict_v15(self):
        self.select("level_scene", "vip-level-12")
        self.select("throne", "enabled")
        active = v.active(self.db, "u")
        self.assertNotIn("level_scene", active)
        self.assertEqual(active["throne"], "enabled")

        self.select("level_scene", "vip-level-10")
        active = v.active(self.db, "u")
        self.assertNotIn("throne", active)
        self.assertIn("level_scene", active)

    def test_vip_room_conflict_v15(self):
        self.select("level_room_decor", "vip-level-07")
        self.select("royal_room", "enabled")
        active = v.active(self.db, "u")
        self.assertNotIn("level_room_decor", active)
        self.assertEqual(active["royal_room"], "enabled")

        self.select("level_room_decor", "vip-level-07")
        active = v.active(self.db, "u")
        self.assertNotIn("royal_room", active)
        self.assertIn("level_room_decor", active)

    def test_vip_gift_seal_conflict_v15(self):
        self.select("level_gift_seal", "vip-level-09")
        self.select("gift_seal", "lion")
        active = v.active(self.db, "u")
        self.assertNotIn("level_gift_seal", active)
        self.assertEqual(active["gift_seal"], "lion")

        self.select("level_gift_seal", "vip-level-05")
        active = v.active(self.db, "u")
        self.assertNotIn("gift_seal", active)
        self.assertIn("level_gift_seal", active)

    def test_neon_privacy_preserves_other_rewards_v16(self):
        self.select("name_gold", "gold")
        self.select("crown_name", "enabled")
        self.select("level_cover", "vip-level-06")
        self.select("level_scene", "vip-level-12")

        self.db.add(
            v.UserPrivacy(user_id="u", hide_vip_neon=True)
        )
        self.db.commit()

        profile = v.profile(self.db, self.user)

        self.assertNotIn("name_gold", profile)
        self.assertNotIn("crown_name", profile)
        self.assertIn("level_cover", profile)
        self.assertIn("level_scene", profile)

    def test_showcase_downgrade_protection_v16(self):
        from app.cosmetic_routes import vip_level_rewards

        reward = next(
            r for tier in vip_level_rewards(self.user)
            if tier["level"] == 12
            for r in tier["rewards"]
            if r["cosmetic_type"] == "frame"
        )

        key = reward["asset_key"]

        self.db.add(v.UserCosmetic(
            user_id="u",
            cosmetic_type="frame",
            asset_key=key,
        ))
        self.db.commit()

        payload = {
            "items": [{"type": "frame", "key": key}]
        }

        self.assertEqual(
            self.request(
                "/showcase", "PUT", payload
            ).status_code, 200
        )

        self.assertTrue(
            v.profile(self.db, self.user)["showcase"]
        )

        self.db.get(v.VipStatus, "u").level = 9
        self.db.commit()

        self.assertEqual(
            v.profile(self.db, self.user)["showcase"], []
        )

        self.assertEqual(
            self.request(
                "/showcase", "PUT", payload
            ).status_code, 403
        )
        self.db.rollback()

    def test_shared_gallery_respects_privacy_v16(self):
        from app.relationship_models import Couple, CoupleMember

        self.db.add(
            v.VipStatus(user_id="f", level=8, total_spent=0)
        )
        self.db.add(
            Couple(id="vip-house", male_id="u",
                   female_id="f", active=True)
        )
        self.db.flush()

        self.db.add_all([
            CoupleMember(user_id="u", couple_id="vip-house"),
            CoupleMember(user_id="f", couple_id="vip-house"),
            SocialPost(
                id=90, user_id="f", caption="VIP",
                audience="public", mime_type="image/png"
            ),
        ])
        self.db.commit()

        self.select("shared_gallery", "enabled")

        self.client.app.dependency_overrides[
            v.current_cosmetic_user
        ] = lambda: self.friend

        self.assertEqual(
            self.select("shared_gallery", "enabled").status_code,
            200
        )
        self.assertEqual(
            self.request(
                "/gallery", "PUT", {"post_ids": [90]}
            ).status_code, 200
        )

        self.assertIn(
            90, v.profile(self.db, self.user)["gallery"]
        )

        self.db.add(
            v.UserPrivacy(user_id="f", hide_vip=True)
        )
        self.db.commit()

        self.assertNotIn(
            90, v.profile(self.db, self.user)["gallery"]
        )

    def test_duo_entry_real_presence_v17(self):
        from app.room_models import RoomMember, RoomLivePresence

        self.db.add(Room(
            id="vip-room",
            public_id="000000000090",
            owner_id="u",
            name="VIP Sarayi",
        ))
        self.db.commit()

        member = RoomMember(
            room_id="vip-room",
            user_id="f",
            ghost=False,
        )
        self.db.add(member)
        self.db.commit()

        check = lambda: v.partner_present_in_room(
            self.db, "vip-room", "f"
        )

        self.assertFalse(check())

        presence = RoomLivePresence(
            room_id="vip-room",
            user_id="f",
            last_seen_at=v.now(),
        )
        self.db.add(presence)
        self.db.commit()

        self.assertTrue(check())

        presence.last_seen_at = (
            v.now() - timedelta(seconds=60)
        )
        self.db.commit()

        self.assertFalse(check())

        presence.last_seen_at = v.now()
        member.ghost = True
        self.db.commit()

        self.assertFalse(check())

        member.ghost = False
        self.db.commit()

        self.assertTrue(check())

        self.db.delete(member)
        self.db.commit()

        self.assertFalse(check())

    def test_shared_room_decoration_conflict_v17(self):
        from app.relationship_models import (
            Couple, CoupleMember, CoupleRoom
        )

        room = Room(
            id="vip-home",
            public_id="000000000091",
            owner_id="u",
            name="Hanedan Sarayi",
        )
        self.db.add(room)
        self.db.add(Couple(
            id="vip-house17",
            male_id="u",
            female_id="f",
            active=True,
        ))
        self.db.flush()

        self.db.add_all([
            CoupleMember(
                user_id="u",
                couple_id="vip-house17",
            ),
            CoupleMember(
                user_id="f",
                couple_id="vip-house17",
            ),
            CoupleRoom(
                couple_id="vip-house17",
                room_id="vip-home",
            ),
        ])
        self.db.commit()

        self.select("royal_room", "enabled")
        self.select("home_decor", "couple")

        active = v.room_style(self.db, room)

        self.assertEqual(active["room_decor"], "palace")
        self.assertNotIn("royal_room", active)
        self.assertNotIn("palace_room", active)

        self.select("home_decor", None)

        active = v.room_style(self.db, room)

        self.assertEqual(active["royal_room"], "enabled")

    def test_active_gift_favorites_v18(self):
        from app.room_routes import GIFT_CATALOG, GIFT_META

        active = next(iter(GIFT_CATALOG))
        retired = next(
            k for k in GIFT_META if k not in GIFT_CATALOG
        )

        r = self.request(
            "/favorites/gifts", "PUT",
            {"ids": [active, active]}
        )
        self.assertEqual(r.status_code, 200, r.text)

        items = self.request("/favorites/gifts").json()["items"]
        self.assertEqual([x["id"] for x in items], [active])

        r = self.request(
            "/favorites/gifts", "PUT",
            {"ids": [retired]}
        )
        self.assertEqual(r.status_code, 422)
        self.db.rollback()

        self.assertEqual(
            [x["id"] for x in
             self.request("/favorites/gifts").json()["items"]],
            [active]
        )
        self.assertEqual(self.user.lidya, 12345)

    def test_gift_favorite_level_and_capacity_v18(self):
        from app.room_routes import GIFT_CATALOG

        keys = list(GIFT_CATALOG)

        r = self.request(
            "/favorites/gifts", "PUT",
            {"ids": keys[:13]}
        )
        self.assertEqual(r.status_code, 422)
        self.db.rollback()

        self.db.get(v.VipStatus, "u").level = 4
        self.db.commit()

        self.assertEqual(
            self.request("/favorites/gifts").status_code,
            403
        )
        self.assertEqual(
            self.request(
                "/favorites/gifts", "PUT",
                {"ids": keys[:1]}
            ).status_code,
            403
        )
        self.db.rollback()
        self.assertEqual(self.user.lidya, 12345)

    def test_missing_auth_is_rejected(self):
        app = FastAPI()
        app.include_router(v.router)
        app.dependency_overrides[v.get_db] = lambda: self.db
        self.assertEqual(TestClient(app).get("/v1/me/vip/benefits").status_code, 401)

    def test_scene_selection_and_disabling_do_not_leave_conflicting_effects(self):
        self.select("royal_scene", "enabled")
        self.select("scenes", "palace")
        self.assertNotIn("royal_scene", v.active(self.db, "u"))
        self.assertEqual(v.active(self.db, "u")["scenes"], "palace")
        self.select("scenes", None)
        self.assertNotIn("scenes", v.active(self.db, "u"))

    def test_friend_id_validation_v11(self):
        for invalid in (
            "123456789",
            "12345678901",
            "000000000002",
            "123456789a",
            "１２３４５６７８９０",
        ):
            self.assertEqual(
                self.request("/friend/" + invalid).status_code,
                422,
            )
            self.assertEqual(
                self.request(
                    "/friend",
                    "POST",
                    {"public_id": invalid, "item": "trial-palace"},
                ).status_code,
                422,
            )
        self.assertIsNone(
            self.db.get(v.VipBenefitLease, ("f", "trial-palace"))
        )

    def test_friend_monthly_quota_is_enforced(self):
        for n in range(5):
            self.db.add(
                v.VipBenefitReceipt(
                    user_id="u",
                    key="friend:" + v.period("monthly") + ":old" + str(n),
                    amount=1,
                    created_at=v.now(),
                )
            )
        self.db.commit()
        with patch("app.moderation.active_ban", return_value=None):
            self.assertEqual(
                self.request(
                    "/friend",
                    "POST",
                    {"public_id": "0000000002", "item": "trial-palace"},
                ).status_code,
                403,
            )

    def test_privacy_and_owner_room_scope(self):
        self.select("royal_room", "enabled")
        self.select("name_gold", "gold")
        room = Room(id="r", public_id="000000000003", owner_id="u", name="Saray")
        other = Room(id="s", public_id="000000000004", owner_id="f", name="Diğer")
        self.db.add_all([room, other])
        self.db.commit()
        self.assertIn("royal_room", v.room_style(self.db, room))
        self.assertEqual(v.room_style(self.db, other), {})
        self.db.add(v.UserPrivacy(user_id="u", hide_vip=True))
        self.db.commit()
        self.assertEqual(v.profile(self.db, self.user), {})
        self.assertEqual(v.entry_style(self.db, "u"), {})

    def test_showcase_ownership_and_capacity(self):
        self.db.add(
            v.UserCosmetic(user_id="u", cosmetic_type="frame", asset_key="frame")
        )
        self.db.commit()
        self.assertEqual(
            self.request(
                "/showcase", "PUT", {"items": [{"type": "frame", "key": "stolen"}]}
            ).status_code,
            403,
        )
        self.db.rollback()
        self.assertEqual(
            self.request(
                "/showcase", "PUT", {"items": [{"type": "frame", "key": "frame"}]}
            ).status_code,
            200,
        )
        self.assertEqual(
            v.profile(self.db, self.user)["showcase"],
            [{"type": "frame", "key": "frame"}],
        )

    def test_gallery_rejects_other_private_posts(self):
        self.db.add_all(
            [
                SocialPost(
                    id=1,
                    user_id="u",
                    caption="A",
                    audience="public",
                    mime_type="image/png",
                ),
                SocialPost(
                    id=2,
                    user_id="f",
                    caption="B",
                    audience="public",
                    mime_type="image/png",
                ),
                SocialPost(
                    id=3,
                    user_id="u",
                    caption="C",
                    audience="followers",
                    mime_type="image/png",
                ),
            ]
        )
        self.db.commit()
        for id in (2, 3):
            self.assertEqual(
                self.request("/gallery", "PUT", {"post_ids": [id]}).status_code, 403
            )
            self.db.rollback()
        self.assertEqual(
            self.request("/gallery", "PUT", {"post_ids": [1]}).status_code, 200
        )
        self.db.get(SocialPost, 1).audience = "followers"
        self.db.commit()
        self.assertEqual(v.profile(self.db, self.user)["gallery"], [])

    def test_vote_can_change_but_never_duplicate(self):
        for choice in ("sardis", "sardis", "palace"):
            self.assertEqual(self.request("/vote/" + choice, "POST").status_code, 200)
        self.assertEqual(
            self.request("/vote").json()["counts"],
            {"sardis": 0, "paktolos": 0, "palace": 1},
        )

    def test_friend_limits_repeats_and_recipient_can_activate_without_vip(self):
        with patch("app.moderation.active_ban", return_value=None):
            self.assertEqual(
                self.request("/friend/0000000002").json()["nickname"], "Arkadaş"
            )
            for _ in range(2):
                self.assertEqual(
                    self.request(
                        "/friend",
                        "POST",
                        {"public_id": "0000000002", "item": "trial-palace"},
                    ).status_code,
                    200,
                )
            self.assertEqual(self.request("").json()["friend_used"], 1)
            self.db.add(v.UserBlock(blocker_id="u", blocked_id="f"))
            self.db.commit()
            self.assertEqual(self.request("/friend/0000000002").status_code, 403)
        lease = self.db.get(v.VipBenefitLease, ("f", "trial-palace"))
        self.assertIsNotNone(lease)
        self.client.app.dependency_overrides[v.current_cosmetic_user] = (
            lambda: self.friend
        )
        self.assertEqual(self.select("trial_scene", "trial-palace").status_code, 200)
        self.assertIn("trial_scene", self.request("").json()["active"])

    def test_every_level_has_two_gender_previews_and_verified_active_variant(self):
        for gender in ("male", "female"):
            self.user.gender = gender
            self.db.commit()
            data = self.request("").json()
            self.assertEqual(
                {r["level"] for r in data["level_rewards"]}, set(range(1, 13))
            )
            for reward in data["level_rewards"]:
                self.assertEqual(set(reward["variants"]), {"male", "female"})
                self.assertIn("/" + gender + "/", reward["asset"])
                r = self.select(reward["slot"], reward["id"])
                self.assertEqual(r.status_code, 200, r.text)
                self.assertEqual(r.json()["active"][reward["slot"]]["gender"], gender)

    def test_direct_reward_slot_and_downgrade_are_server_checked(self):
        self.assertEqual(self.select("level_cover", "vip-level-09").status_code, 422)
        self.db.rollback()
        self.select("level_scene", "vip-level-12")
        self.db.get(v.VipStatus, "u").level = 11
        self.db.commit()
        self.assertNotIn("level_scene", v.active(self.db, "u"))
        self.assertEqual(self.select("level_scene", "vip-level-12").status_code, 403)
        self.db.rollback()
        self.assertEqual(self.select("level_cover", "vip-level-03").status_code, 200)

    def test_direct_room_and_relationship_garden_use_the_owner_gender_art(self):
        from app.relationship_models import Couple, CoupleMember, CoupleRoom

        room = Room(id="shared", public_id="000000000003", owner_id="u", name="Hanedan")
        self.db.add(room)
        self.db.commit()
        self.select("level_room_decor", "vip-level-07")
        self.assertIn(
            "/male/room.png", v.room_style(self.db, room)["level_room_decor"]["asset"]
        )
        self.db.add(Couple(id="house", male_id="u", female_id="f", active=True))
        self.db.flush()
        self.db.add_all(
            [
                CoupleMember(user_id="u", couple_id="house"),
                CoupleMember(user_id="f", couple_id="house"),
                CoupleRoom(couple_id="house", room_id="shared"),
            ]
        )
        self.db.commit()
        self.select("level_home_decor", "vip-level-08")
        self.select("home_decor", "couple")
        self.assertIn(
            "/male/home.png", v.room_style(self.db, room)["level_room_decor"]["asset"]
        )

    def test_direct_entry_and_gift_art_obey_privacy(self):
        self.select("level_entry_frame", "vip-level-04")
        self.select("level_gift_seal", "vip-level-05")
        self.assertIn(
            "/male/entry.png", v.entry_style(self.db, "u")["level_entry_frame"]["asset"]
        )
        self.assertIn(
            "/male/gift.png", v.gift_style(self.db, "u")["level_gift_seal"]["asset"]
        )
        self.db.add(v.UserPrivacy(user_id="u", hide_vip=True))
        self.db.commit()
        self.assertEqual(v.entry_style(self.db, "u"), {})
        self.assertEqual(v.gift_style(self.db, "u"), {})


if __name__ == "__main__":
    unittest.main()
