import unittest
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, APIRouter
from unittest.mock import patch
from backend.app import family_routes
from backend.app.platform_models import (
    FamilyDonation, FamilyMember, VipStatus
)
import test_family_privacy_v4 as fixture_module


class FamilyContributionV3(unittest.TestCase):

    def setUp(self):
        self.fixture = fixture_module.FamilyPrivacyV4()
        self.fixture.setUp()
        self.addCleanup(self.fixture.tearDown)
        self.db = self.fixture.db

        for model in (FamilyDonation, VipStatus):
            model.__table__.create(
                self.fixture.engine, checkfirst=True
            )

        router = APIRouter()
        with patch.object(family_routes, "router", router):
            family_routes.register_family_auth(lambda: None)

        self.endpoint = next(
            r.endpoint for r in router.routes
            if r.path.endswith("/families/{family_id}/insights")
            and "GET" in r.methods
        )

        self.now = datetime.now(timezone.utc)
        self.owner = self.fixture.owner
        self.member = self.fixture.member

        self.add_donation(self.owner, 1000)
        self.add_donation(self.member, 500)
        self.add_donation(
            self.fixture.other, 9000, family="family-b"
        )
        self.db.commit()

    def add_donation(self, user, amount,
                     family="family-a", date=None):
        self.db.add(FamilyDonation(
            family_id=family,
            user_id=user.id,
            amount=amount,
            created_at=date or self.now
        ))

    def read(self, user=None, period="all", page=1):
        return self.endpoint(
            family_id="family-a",
            period=period,
            page=page,
            db=self.db,
            user=user or self.owner
        )

    def denied(self, user, status=403):
        with self.assertRaises(HTTPException) as ctx:
            self.read(user=user)
        self.assertEqual(ctx.exception.status_code, status)

    def test_01_member_access(self):
        self.assertEqual(
            self.read(self.member)["all_time_total"], 1500
        )

    def test_02_outsider_denied(self):
        self.denied(self.fixture.outsider)

    def test_03_left_member_denied(self):
        self.db.delete(self.db.get(FamilyMember, 2))
        self.db.commit()
        self.denied(self.member)

    def test_04_other_family_denied(self):
        self.denied(self.fixture.other)

    def test_05_daily(self):
        self.add_donation(
            self.owner, 300,
            date=self.now - timedelta(days=2)
        )
        self.db.commit()
        self.assertEqual(
            self.read(period="daily")["today_total"], 1500
        )

    def test_06_weekly(self):
        self.add_donation(
            self.owner, 300,
            date=self.now - timedelta(days=8)
        )
        self.db.commit()
        self.assertEqual(
            self.read(period="weekly")["week_total"], 1500
        )

    def test_07_monthly(self):
        self.add_donation(
            self.owner, 300,
            date=self.now - timedelta(days=40)
        )
        self.db.commit()
        self.assertEqual(
            self.read(period="monthly")["month_total"], 1500
        )

    def test_08_personal_total(self):
        self.assertEqual(
            self.read(self.member)["my_total"], 500
        )

    def test_09_personal_rank(self):
        self.assertEqual(self.read()["my_rank"], 1)
        self.assertEqual(
            self.read(self.member)["my_rank"], 2
        )

    def test_10_equal_totals(self):
        self.add_donation(self.member, 500)
        self.db.commit()
        data = self.read()
        ids = [
            x["user_id"]
            for x in data["top_contributors"]
        ]
        self.assertEqual(ids, sorted(ids))
        self.assertEqual(
            data["my_rank"], ids.index(self.owner.id) + 1
        )

    def test_11_pagination(self):
        for _ in range(23):
            self.add_donation(self.owner, 10)
        self.db.commit()
        first = self.read(page=1)
        second = self.read(page=2)
        self.assertEqual(len(first["recent"]), 20)
        self.assertEqual(len(second["recent"]), 5)
        self.assertEqual(first["total_pages"], 2)
        self.assertTrue(first["has_more"])
        self.assertFalse(second["has_more"])

    def test_12_empty_history(self):
        self.db.query(FamilyDonation).filter_by(
            family_id="family-a"
        ).delete()
        self.db.commit()
        data = self.read()
        self.assertEqual(data["recent"], [])
        self.assertEqual(data["my_total"], 0)
        self.assertIsNone(data["my_rank"])

    def test_13_read_only(self):
        before = (
            self.owner.lidya,
            self.member.lidya,
            self.fixture.family.balance
        )
        self.read()
        self.read(period="daily")
        self.db.refresh(self.owner)
        self.db.refresh(self.member)
        self.db.refresh(self.fixture.family)
        self.assertEqual(before, (
            self.owner.lidya,
            self.member.lidya,
            self.fixture.family.balance
        ))

    def test_14_cosmetics(self):
        self.owner.avatar_asset = "/test/avatar.png"
        self.owner.frame_asset = "/test/frame.png"
        self.db.commit()
        top = self.read()["top_contributors"][0]
        self.assertEqual(
            top["avatar_asset"], "/test/avatar.png"
        )
        self.assertEqual(
            top["frame_asset"], "/test/frame.png"
        )

    def test_15_vip(self):
        self.db.add(VipStatus(
            user_id=self.owner.id, level=5
        ))
        self.db.commit()
        self.assertEqual(
            self.read()["top_contributors"][0]["vip_level"],
            5
        )
