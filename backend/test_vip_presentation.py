"""Run with DATABASE_URL=sqlite:///:memory: python -m unittest test_vip_presentation."""
import unittest
from pathlib import Path
from sqlalchemy.orm import Session
from app.db import engine
from app.models import User, UserCosmetic
from app.platform_models import UserPrivacy, VipStatus, VipRewardClaim
from app.vip_presentation import presentation_rewards, visible_entry_level, entrance_inventory, entry_selection
from app.cosmetic_routes import list_vip_rewards, equip_vip_entrance, appearance_inventory, apply_wallpaper
from app.wallpapers import catalog as wallpaper_catalog
from fastapi import HTTPException


class VIPPresentationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from app.db import Base
        import app.room_routes
        import app.relationship_models
        from sqlalchemy import BigInteger, Integer
        # SQLite only autoincrements an INTEGER primary key; production uses PostgreSQL.
        for table in Base.metadata.tables.values():
            for column in table.columns:
                if column.primary_key and isinstance(column.type, BigInteger):
                    column.type = column.type.with_variant(Integer(), 'sqlite')
        Base.metadata.create_all(engine)
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

    def test_selection_persists_and_rejects_unearned_levels(self):
        with Session(engine) as db:
            user=User(id='selection',public_id='0000000003',nickname='Test',gender='male')
            db.add_all([user,VipStatus(user_id=user.id,level=6)]);db.commit()
            self.assertEqual(len(entrance_inventory(db,user)),7)
            for n in range(1,7):
                equip_vip_entrance({'asset_key':f'vip-entrance-{n}'},user,db)
                db.expire_all()
                self.assertEqual(visible_entry_level(db,user.id),n)
                self.assertEqual(sum(i['equipped'] for i in entrance_inventory(db,user)),1)
            for key in ('vip-entrance-7','vip-entrance-12','vip-entrance--1','vip-entrance-01','../../a',None,[] ):
                with self.assertRaises(HTTPException):equip_vip_entrance({'asset_key':key},user,db)
            equip_vip_entrance({'asset_key':'normal'},user,db)
            self.assertEqual(entry_selection(db,user.id),('normal',0))
            self.assertTrue(entrance_inventory(db,user)[0]['equipped'])
            equip_vip_entrance({'asset_key':'auto'},user,db)
            self.assertEqual(visible_entry_level(db,user.id),6)
            equip_vip_entrance({'asset_key':'vip-entrance-6'},user,db)
            db.get(VipStatus,user.id).level=2;db.commit()
            self.assertEqual(visible_entry_level(db,user.id),2)

    def test_gender_inventory_and_free_normal_without_vip(self):
        with Session(engine) as db:
            user=User(id='normal',public_id='0000000004',nickname='Test',gender='female')
            db.add(user);db.commit()
            equip_vip_entrance({'asset_key':'normal'},user,db)
            self.assertEqual(entry_selection(db,user.id),('normal',0))
            with self.assertRaises(HTTPException):equip_vip_entrance({'asset_key':'vip-entrance-1'},user,db)
            for gender in ('male','female'):
                user.gender=gender;db.flush()
                levels=[i for i in wallpaper_catalog(gender) if i.get('gender')]
                self.assertEqual(len(levels),13)
                self.assertTrue(all(i['gender']==gender for i in levels))
                self.assertTrue(all((Path(__file__).resolve().parents[1]/'frontend'/i['asset']).is_file() for i in levels))
                for n in range(1,13):
                    self.assertTrue((Path(__file__).resolve().parents[1]/'frontend'/presentation_rewards(n,gender)[1]['asset_url']).is_file())

    def test_real_collection_automatic_entitlements_and_gender_apply(self):
        from app.db import Base
        import app.relationship_models
        import app.room_models
        Base.metadata.create_all(engine)
        with Session(engine) as db:
            user=User(id='collection',public_id='0000000005',nickname='Test',gender='male')
            db.add_all([user,VipStatus(user_id=user.id,level=4)]);db.commit()
            data=appearance_inventory(user,db)
            entries=[i for i in data['items'] if i['type']=='entrance']
            self.assertEqual(len(entries),5)
            walls=[i for i in data['items'] if i['type']=='wallpaper']
            self.assertEqual(len(walls),5)
            self.assertTrue(all('male' in i['asset'] for i in walls))
            self.assertEqual(len(appearance_inventory(user,db)['items']),len(data['items']))
            apply_wallpaper({'asset_key':'wallpaper_male_standard'},user,db)
            self.assertEqual(user.wallpaper_asset,'wallpaper_male_standard')
            for key in ('vip_wallpaper_male_05','vip_wallpaper_female_01','wallpaper_female_standard'):
                with self.assertRaises(HTTPException):apply_wallpaper({'asset_key':key},user,db)

    def test_room_wallpaper_owner_gender_and_level(self):
        from app.db import Base
        from app.room_models import Room
        from app.room_routes import register_room_auth, router, RoomWallpaperUpdate, room_view
        import app.relationship_models
        Base.metadata.create_all(engine)
        register_room_auth(lambda:None)
        buy=next(r.endpoint for r in router.routes if r.path=='/v1/rooms/{room_id}/wallpaper' and 'POST' in r.methods)
        with Session(engine) as db:
            user=User(id='wall-owner',public_id='0000000006',nickname='Owner',gender='male',lidya=0)
            visitor=User(id='wall-visitor',public_id='0000000007',nickname='Visitor',gender='male')
            room=Room(id='wall-room',public_id='0000000100',owner_id=user.id,name='Test')
            vip=VipStatus(user_id=user.id,level=4)
            db.add_all([user,visitor,room,vip]);db.commit()
            for key in ('wallpaper_male_standard','vip_wallpaper_male_04'):
                result=buy(room.id,RoomWallpaperUpdate(asset_key=key,days=1),db,user)
                self.assertEqual(result['spent'],0)
                self.assertEqual(user.lidya,0)
                self.assertEqual(room_view(db,room,user)['wallpaper_asset_path'],result['asset_path'])
                self.assertIsNone(room_view(db,room,user)['wallpaper_expires_at'])
            for key in ('vip_wallpaper_male_05','vip_wallpaper_female_01','wallpaper_female_standard'):
                with self.assertRaises(HTTPException):buy(room.id,RoomWallpaperUpdate(asset_key=key,days=1),db,user)
            with self.assertRaises(HTTPException):buy(room.id,RoomWallpaperUpdate(asset_key='wallpaper_male_standard',days=1),db,visitor)
            vip.level=0;db.commit()
            self.assertIsNone(room_view(db,room,user)['wallpaper_asset'])


if __name__ == "__main__":
    unittest.main()
