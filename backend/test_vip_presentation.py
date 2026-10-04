"""Run with DATABASE_URL=sqlite:///:memory: python -m unittest test_vip_presentation."""
import unittest
from pathlib import Path
from sqlalchemy.orm import Session
from app.db import engine
from app.models import User, UserCosmetic
from app.platform_models import UserPrivacy, VipStatus, VipRewardClaim
from app.vip_presentation import presentation_rewards, visible_entry_level
from app.cosmetic_routes import list_vip_rewards


class VIPPresentationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        for table in (User.__table__, UserPrivacy.__table__, VipStatus.__table__,
                      UserCosmetic.__table__, VipRewardClaim.__table__):
            table.create(engine, checkfirst=True)

    def test_all_level_rewards_and_automatic_entitlement(self):
        with Session(engine) as db:
            user = User(id="benefits", public_id="0000000001", nickname="Test", gender="male")
            db.add_all([user, VipStatus(user_id=user.id, level=6)])
            db.commit()
            rows = list_vip_rewards(user, db)
            self.assertEqual(len(rows), 12)
            for row in rows:
                level = row["level"]
                self.assertEqual(row["unlocked"], level <= 6)
                self.assertFalse(row["claimed"])
                benefits = row["presentation_rewards"]
                self.assertEqual({r["type"] for r in benefits}, {"profile_window", "vip_entrance"})
                self.assertTrue(all(r["automatic"] for r in benefits))
                self.assertTrue((Path(__file__).resolve().parents[1] / "frontend" / benefits[0]["asset_url"]).is_file())
            self.assertEqual(db.query(UserCosmetic).filter_by(user_id=user.id).count(), 0)

    def test_privacy_and_authoritative_levels(self):
        with Session(engine) as db:
            user = User(id="privacy", public_id="0000000002", nickname="Test")
            status = VipStatus(user_id=user.id, level=0)
            privacy = UserPrivacy(user_id=user.id, hide_vip=False, hide_vip_entry=False)
            db.add_all([user, status, privacy]); db.commit()
            for level in range(13):
                status.level = level; db.flush()
                self.assertEqual(visible_entry_level(db, user.id), level)
                privacy.hide_vip_entry = True
                self.assertEqual(visible_entry_level(db, user.id), 0)
                privacy.hide_vip_entry = False; privacy.hide_vip = True
                self.assertEqual(visible_entry_level(db, user.id), 0)
                privacy.hide_vip = False
            self.assertEqual(visible_entry_level(db, "missing"), 0)

    def test_out_of_range_benefits(self):
        for level in (-1, 0, 13):
            self.assertEqual(presentation_rewards(level), [])


if __name__ == "__main__":
    unittest.main()
