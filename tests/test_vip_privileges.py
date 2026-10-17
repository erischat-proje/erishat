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
    support_models,
    chat_ban_models,
    ban_workflow_models,
    vip_spending,
    relationship_models,
)


class Benefits(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        v.Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine, expire_on_commit=False)()
        self.user = v.User(
            id="u",
            public_id="000000000001",
            nickname="Kaan",
            gender="male",
            lidya=12345,
        )
        self.friend = v.User(
            id="f",
            public_id="000000000002",
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
        self.assertEqual(r["daily_points"], 150)
        self.db.get(v.VipStatus, "u").level = 1
        self.db.commit()
        self.assertEqual(self.select("royal_scene", "enabled").status_code, 403)
        self.assertEqual(
            self.select("name_gold", "url(javascript:bad)").status_code, 422
        )
        self.assertEqual(self.select("name_gold", "gold").status_code, 200)
        self.assertEqual(self.select("name_gold", None).status_code, 200)

    def test_daily_idempotence_and_level_upgrade_not_double_reward(self):
        for _ in range(2):
            self.assertEqual(self.request("/claim/daily", "POST", {}).status_code, 200)
        self.assertEqual(v.state(self.db, "u").points, 150)
        self.assertEqual(self.user.lidya, 12345)
        self.db.get(v.VipStatus, "u").level = 1
        self.db.commit()
        self.request("/claim/daily", "POST", {})
        self.assertEqual(v.state(self.db, "u").points, 150)

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

    def test_points_shop_spend_once_and_reject_insufficient(self):
        self.assertEqual(self.request("/shop/cover-sardis", "POST").status_code, 400)
        self.db.rollback()
        self.request("/claim/daily", "POST", {})
        self.request("/shop/cover-sardis", "POST")
        self.request("/shop/cover-sardis", "POST")
        self.assertEqual(v.state(self.db, "u").points, 50)
        self.assertEqual(self.select("point_cover", "cover-sardis").status_code, 200)
        self.assertEqual(self.select("point_cover", "cover-paktolos").status_code, 403)

    def test_coupon_one_transaction_and_no_effect_when_disabled(self):
        self.assertEqual(v.coupon_price(self.db, "u", 1000), 1000)
        self.select("coupon", "enabled")
        self.assertEqual(v.coupon_price(self.db, "u", 1000), 850)
        self.assertEqual(v.coupon_price(self.db, "u", 1000, consume=True), 850)
        self.db.commit()
        self.assertEqual(v.coupon_price(self.db, "u", 1000), 1000)
        self.assertEqual(self.user.lidya, 12345)

    def test_real_cosmetic_purchase_applies_coupon_only_after_success(self):
        self.select("coupon", "enabled")
        key = "shop-expansion/avatar-male-01.png"
        r = self.client.post(
            "/v1/me/cosmetics/purchase",
            json={"cosmetic_type": "avatar", "asset_key": key},
        )
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["spent"], 850)
        self.assertEqual(self.user.lidya, 11495)
        self.assertTrue(v.claimed(self.db, "u", "coupon"))
        repeat = self.client.post(
            "/v1/me/cosmetics/purchase",
            json={"cosmetic_type": "avatar", "asset_key": key},
        )
        self.assertEqual(repeat.status_code, 409)
        self.db.rollback()
        key = "shop-expansion/avatar-male-02.png"
        r = self.client.post(
            "/v1/me/cosmetics/purchase",
            json={"cosmetic_type": "avatar", "asset_key": key},
        )
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["spent"], 1000)

    def test_failed_purchase_does_not_consume_coupon(self):
        self.select("coupon", "enabled")
        self.user.lidya = 0
        self.db.commit()
        r = self.client.post(
            "/v1/me/cosmetics/purchase",
            json={
                "cosmetic_type": "avatar",
                "asset_key": "shop-expansion/avatar-male-01.png",
            },
        )
        self.assertEqual(r.status_code, 400)
        self.db.rollback()
        self.assertFalse(v.claimed(self.db, "u", "coupon"))

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
                    {"public_id": "000000000002", "item": "trial-palace"},
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
                self.request("/friend/000000000002").json()["nickname"], "Arkadaş"
            )
            for _ in range(2):
                self.assertEqual(
                    self.request(
                        "/friend",
                        "POST",
                        {"public_id": "000000000002", "item": "trial-palace"},
                    ).status_code,
                    200,
                )
            self.assertEqual(self.request("").json()["friend_used"], 1)
            self.db.add(v.UserBlock(blocker_id="u", blocked_id="f"))
            self.db.commit()
            self.assertEqual(self.request("/friend/000000000002").status_code, 403)
        lease = self.db.get(v.VipBenefitLease, ("f", "trial-palace"))
        self.assertIsNotNone(lease)
        self.client.app.dependency_overrides[v.current_cosmetic_user] = (
            lambda: self.friend
        )
        self.assertEqual(self.select("trial_scene", "trial-palace").status_code, 200)
        self.assertIn("trial_scene", self.request("").json()["active"])


if __name__ == "__main__":
    unittest.main()
