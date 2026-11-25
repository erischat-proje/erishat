import unittest

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from backend.app.db import Base
from backend.app.models import User
from backend.app.admin_models import AdminRole
from backend.app.platform_models import (
    Family, FamilyMember, SocialPost
)
from backend.app.explore_feed import visible_query


class FamilyPrivacyV4(unittest.TestCase):

    def setUp(self):
        self.engine = create_engine(
            "sqlite+pysqlite:///:memory:"
        )
        from types import SimpleNamespace
        from sqlalchemy.sql import visitors
        from sqlalchemy import Table

        required = {
            User.__table__,
            Family.__table__,
            FamilyMember.__table__,
            SocialPost.__table__,
            AdminRole.__table__,
        }

        query = visible_query(
            SimpleNamespace(id="test-user"),
            family_id="test-family"
        )

        for node in visitors.iterate(query):
            if isinstance(node, Table):
                required.add(node)

        pending = list(required)
        while pending:
            table = pending.pop()
            for fk in table.foreign_keys:
                target = fk.column.table
                if target not in required:
                    required.add(target)
                    pending.append(target)

        Base.metadata.create_all(
            self.engine,
            tables=list(required)
        )

        self.db = sessionmaker(bind=self.engine)()

        self.owner = self.user("owner", "910001")
        self.member = self.user("member", "910002")
        self.outsider = self.user("outsider", "910003")
        self.other = self.user("other", "910004")

        self.family = Family(
            id="family-a",
            owner_id=self.owner.id,
            name="Test Family A",
            chat_conversation_id="chat-a",
            closed=False
        )

        self.second = Family(
            id="family-b",
            owner_id=self.other.id,
            name="Test Family B",
            chat_conversation_id="chat-b",
            closed=False
        )

        self.db.add_all([self.family, self.second])
        self.db.flush()

        self.db.add_all([
            FamilyMember(
                id=1,
                family_id="family-a",
                user_id=self.owner.id
            ),
            FamilyMember(
                id=2,
                family_id="family-a",
                user_id=self.member.id
            ),
            FamilyMember(
                id=3,
                family_id="family-b",
                user_id=self.other.id
            ),
            SocialPost(
                id=1,
                user_id=self.owner.id,
                caption="Private family post",
                audience="family",
                family_id="family-a",
                is_hidden=False
            ),
            SocialPost(
                id=2,
                user_id=self.owner.id,
                caption="Public post",
                audience="public",
                is_hidden=False
            ),
        ])
        self.db.commit()

    def user(self, uid, public_id):
        user = User(
            id=uid,
            public_id=public_id,
            _nickname=uid,
            is_active=True,
            lidya=0
        )
        self.db.add(user)
        self.db.flush()
        return user

    def ids(self, user, family_id=None):
        query = visible_query(
            user, family_id=family_id
        )
        return {
            post.id
            for post in self.db.scalars(query).all()
        }

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_01_member_can_see_private(self):
        self.assertIn(
            1, self.ids(self.member, "family-a")
        )

    def test_02_owner_can_see_private(self):
        self.assertIn(
            1, self.ids(self.owner, "family-a")
        )

    def test_03_outsider_cannot_see_private(self):
        self.assertNotIn(
            1, self.ids(self.outsider, "family-a")
        )

    def test_04_other_family_cannot_see_private(self):
        self.assertNotIn(
            1, self.ids(self.other, "family-a")
        )

    def test_05_private_excluded_from_explore(self):
        for user in (
            self.owner, self.member,
            self.outsider, self.other
        ):
            self.assertNotIn(1, self.ids(user))

    def test_06_left_member_loses_access(self):
        member = self.db.get(
            FamilyMember, 2
        )
        self.db.delete(member)
        self.db.commit()
        self.assertNotIn(
            1, self.ids(self.member, "family-a")
        )

    def test_07_closed_family_blocks_private(self):
        self.family.closed = True
        self.db.commit()
        self.assertNotIn(
            1, self.ids(self.member, "family-a")
        )

    def test_08_public_posts_preserved(self):
        self.assertIn(
            2, self.ids(self.outsider)
        )


if __name__ == "__main__":
    unittest.main()
