import unittest

from fastapi import HTTPException
from backend.app import main
from backend.app.platform_models import FamilyMember
from test_family_privacy_v4 import FamilyPrivacyV4


class FamilyApiPrivacyV4(unittest.TestCase):

    def setUp(self):
        self.fixture = FamilyPrivacyV4()
        self.addCleanup(self.fixture.tearDown)
        self.fixture.setUp()
        self.db = self.fixture.db

    def denied(self, fn, user, **kwargs):
        with self.assertRaises(HTTPException) as ctx:
            fn(post_id=1, db=self.db, user=user, **kwargs)
        self.assertEqual(ctx.exception.status_code, 404)

    def test_01_member_access(self):
        post = main._social_access(
            self.db, 1, self.fixture.member
        )
        self.assertEqual(post.id, 1)

    def test_02_outsider_access(self):
        with self.assertRaises(HTTPException) as ctx:
            main._social_access(
                self.db, 1, self.fixture.outsider
            )
        self.assertEqual(ctx.exception.status_code, 404)

    def test_03_outsider_media(self):
        self.denied(
            main.get_social_post_media,
            self.fixture.outsider
        )

    def test_04_outsider_like(self):
        self.denied(
            main.like_social_post,
            self.fixture.outsider
        )

    def test_05_outsider_unlike(self):
        self.denied(
            main.unlike_social_post,
            self.fixture.outsider
        )

    def test_06_other_family_media(self):
        self.denied(
            main.get_social_post_media,
            self.fixture.other
        )

    def test_07_left_member_media(self):
        self.db.delete(self.db.get(FamilyMember, 2))
        self.db.commit()

        self.denied(
            main.get_social_post_media,
            self.fixture.member
        )

    def test_08_closed_family_media(self):
        self.fixture.family.closed = True
        self.db.commit()

        self.denied(
            main.get_social_post_media,
            self.fixture.member
        )

    def test_09_owner_cannot_pin_private(self):
        self.denied(
            main.pin_social_post,
            self.fixture.owner
        )

    def test_10_owner_cannot_unpin_private(self):
        self.denied(
            main.unpin_social_post,
            self.fixture.owner
        )
