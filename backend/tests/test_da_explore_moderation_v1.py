import os
os.environ["DATABASE_URL"] = "sqlite://"

import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from fastapi import FastAPI, Depends, Header, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, event
from sqlalchemy import BigInteger
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

import ast
from types import SimpleNamespace
from fastapi import Response
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_
from backend.app import system_logs, system_data
from backend.app.moderation import active_ban
from backend.app.room_models import Room
from backend.app.db import Base, get_db
from backend.app.models import User, Conversation
from backend.app.admin_models import (
    AdminRole, AdminAuditLog, UserBan
)
from backend.app.ban_workflow_models import UserBrowserDevice
from backend.app.platform_models import (
    SocialPost, SocialPostLike, SocialPostComment,
    SocialPostCommentLike, UserFollow, UserBlock,
    Family, FamilyMember
)
from backend.app.explore_models import SavedPost, HiddenPost


@compiles(BigInteger, "sqlite")
def sqlite_bigint(type_, compiler, **kw):
    return "INTEGER"



# Load actual application handlers without importing
# unrelated video processing and production services.

def current_user():
    raise HTTPException(401)

required = {
    "DAExploreRemoveInput",
    "_da_explore_allowed",
    "da_explore_capability",
    "da_explore_remove",
    "_social_access",
    "get_social_post_media",
    "delete_social_post",
}

tree = ast.parse(
    Path("backend/app/main.py").read_text()
)

nodes = [
    node for node in tree.body
    if isinstance(node, (ast.FunctionDef, ast.ClassDef))
    and node.name in required
]

assert {node.name for node in nodes} == required

for node in nodes:
    node.decorator_list = []

scope = dict(globals())
scope["__package__"] = "backend.app"

exec(
    compile(
        ast.Module(body=nodes, type_ignores=[]),
        "da-moderation-handlers",
        "exec"
    ),
    scope
)

main = SimpleNamespace(**{
    name: scope[name]
    for name in required | {"current_user"}
})


class DAModerationV1(unittest.TestCase):

    def setUp(self):
        log_dir = self.enterContext(TemporaryDirectory())

        self.enterContext(
            patch.object(system_logs, "ROOT", Path(log_dir))
        )

        self.enterContext(
            patch.object(system_data, "record", lambda *a, **k: None)
        )

        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )

        if self.engine.dialect.name == "sqlite":
            @event.listens_for(self.engine, "connect")
            def enable_foreign_keys(connection, record):
                connection.execute("PRAGMA foreign_keys=ON")

        models = [
            User, Conversation, AdminRole, AdminAuditLog,
            UserBan, UserBrowserDevice,
            SocialPost, SocialPostLike, SocialPostComment,
            SocialPostCommentLike, UserFollow, UserBlock,
            Family, FamilyMember, SavedPost, HiddenPost,
            system_data.LidyaLedger,
        ]

        tables = {model.__table__ for model in models}
        pending = list(tables)

        while pending:
            table = pending.pop()

            for fk in table.foreign_keys:
                target = fk.column.table

                if target not in tables:
                    tables.add(target)
                    pending.append(target)

        Base.metadata.create_all(
            self.engine, tables=list(tables)
        )

        def session():
            with Session(self.engine) as db:
                yield db

        def identity(
            x_user: str = Header(default=""),
            db: Session = Depends(get_db),
        ):
            user = db.get(User, x_user)

            if not user:
                raise HTTPException(401)

            return user

        app = FastAPI()

        app.dependency_overrides[get_db] = session
        app.dependency_overrides[main.current_user] = identity

        app.get("/v1/admin/explore/moderation")(
            main.da_explore_capability
        )

        app.post("/v1/admin/explore/posts/{post_id}/remove")(
            main.da_explore_remove
        )

        app.get("/v1/posts/{post_id}/media")(
            main.get_social_post_media
        )

        app.delete("/v1/posts/{post_id}")(
            main.delete_social_post
        )

        self.client = TestClient(app)

        with Session(self.engine) as db:
            for i, uid in enumerate([
                "normal", "sa", "ua", "fa",
                "da", "author", "inactive"
            ]):
                db.add(User(
                    id=uid,
                    public_id=str(9100000000+i),
                    _nickname=uid,
                    lidya=100000,
                    is_active=uid != "inactive",
                ))

            db.flush()

            for uid in ("sa", "ua", "fa", "da"):
                db.add(AdminRole(
                    user_id=uid,
                    role=uid.upper()
                ))

            db.add(AdminRole(
                user_id="inactive", role="DA"
            ))

            db.add(Conversation(
                id="family-chat", type="group"
            ))

            db.flush()

            db.add(Family(
                id="family-test",
                name="Test family",
                owner_id="author",
                chat_conversation_id="family-chat",
            ))

            db.flush()

            db.add_all([
                SocialPost(
                    id=1, user_id="author",
                    caption="Test post",
                    audience="public",
                    image_bytes=b"test-media",
                    mime_type="image/png",
                ),
                SocialPost(
                    id=2, user_id="author",
                    audience="family",
                    family_id="family-test",
                    caption="Private family",
                ),
                SocialPost(
                    id=3, user_id="author",
                    audience="public",
                    is_hidden=True,
                    caption="Hidden",
                ),
                SocialPost(
                    id=4, user_id="author",
                    audience="followers",
                    caption="Followers only",
                ),
            ])

            db.flush()

            db.add_all([
                SavedPost(user_id="normal", post_id=1),
                HiddenPost(user_id="sa", post_id=1),
                SocialPostLike(user_id="normal", post_id=1),
                SocialPostComment(
                    id=1, post_id=1,
                    user_id="normal", body="Test comment"
                ),
            ])

            db.flush()

            db.add(SocialPostCommentLike(
                comment_id=1, user_id="sa"
            ))

            db.commit()

    def tearDown(self):
        self.client.close()
        self.engine.dispose()

    def remove(self, uid="da", pid=1, reason="Uygunsuz icerik"):
        return self.client.post(
            f"/v1/admin/explore/posts/{pid}/remove",
            headers={"x-user": uid},
            json={"reason": reason},
        )

    def capability(self, uid):
        return self.client.get(
            "/v1/admin/explore/moderation",
            headers={"x-user": uid}
        )

    def test_01_only_da_has_capability(self):
        for uid in ("normal", "sa", "ua", "fa", "inactive"):
            self.assertFalse(
                self.capability(uid).json()["can_remove_post"]
            )

        result = self.capability("da")
        self.assertTrue(result.json()["can_remove_post"])
        self.assertIn("no-store", result.headers["cache-control"])

    def test_02_unauthorized_roles_cannot_delete(self):
        for uid in ("normal", "sa", "ua", "fa", "inactive"):
            self.assertEqual(self.remove(uid).status_code, 403)

        with Session(self.engine) as db:
            self.assertIsNotNone(db.get(SocialPost, 1))
            self.assertEqual(
                len(db.scalars(select(AdminAuditLog)).all()), 0
            )

    def test_03_missing_auth_denied(self):
        self.assertEqual(self.remove("").status_code, 401)

    def test_04_da_can_delete_and_audit(self):
        result = self.remove()

        self.assertEqual(result.status_code, 200, result.text)
        self.assertTrue(result.json()["deleted"])

        with Session(self.engine) as db:
            self.assertIsNone(db.get(SocialPost, 1))

            log = db.scalar(select(AdminAuditLog))

            self.assertEqual(log.admin_id, "da")
            self.assertEqual(log.target_user_id, "author")
            self.assertEqual(log.target_id, "1")
            self.assertEqual(log.action, "explore_post_remove")
            self.assertEqual(
                json.loads(log.details)["reason"],
                "Uygunsuz icerik"
            )

    def test_05_private_posts_protected(self):
        for pid in (2, 3, 4):
            self.assertEqual(
                self.remove(pid=pid).status_code, 404
            )

        with Session(self.engine) as db:
            for pid in (2, 3, 4):
                self.assertIsNotNone(db.get(SocialPost, pid))

    def test_06_repeated_delete_has_one_audit(self):
        self.assertEqual(self.remove().status_code, 200)
        self.assertEqual(self.remove().status_code, 404)

        with Session(self.engine) as db:
            self.assertEqual(
                len(db.scalars(select(AdminAuditLog)).all()), 1
            )

    def test_07_role_revocation_is_immediate(self):
        self.assertTrue(
            self.capability("da").json()["can_remove_post"]
        )

        with Session(self.engine) as db:
            db.delete(db.get(AdminRole, "da"))
            db.commit()

        self.assertEqual(self.remove().status_code, 403)

    def test_08_invalid_reason_rejected(self):
        for reason in ("", "  ", "   ", "a"*2001):
            self.assertEqual(
                self.remove(reason=reason).status_code, 422
            )

    def test_09_media_no_longer_accessible(self):
        headers = {"x-user": "normal"}

        self.assertEqual(
            self.client.get(
                "/v1/posts/1/media", headers=headers
            ).status_code, 200
        )

        self.assertEqual(self.remove().status_code, 200)

        self.assertEqual(
            self.client.get(
                "/v1/posts/1/media", headers=headers
            ).status_code, 404
        )

    def test_10_related_records_removed(self):
        self.assertEqual(self.remove().status_code, 200)

        with Session(self.engine) as db:
            for model in (
                SavedPost, HiddenPost, SocialPostLike,
                SocialPostComment, SocialPostCommentLike
            ):
                self.assertEqual(
                    len(db.scalars(select(model)).all()), 0
                )

    def test_11_balances_unchanged(self):
        self.assertEqual(self.remove().status_code, 200)

        with Session(self.engine) as db:
            for user in db.scalars(select(User)):
                self.assertEqual(user.lidya, 100000)

    def test_12_owner_delete_rules_preserved(self):
        result = self.client.delete(
            "/v1/posts/1",
            headers={"x-user": "normal"}
        )
        self.assertEqual(result.status_code, 403)

        result = self.client.delete(
            "/v1/posts/1",
            headers={"x-user": "author"}
        )
        self.assertEqual(result.status_code, 200)



    def test_15_real_session_tokens(self):
        from backend.app.session import (
            UserSession, create_session,
            get_user_from_token, revoke_session
        )
        import sys

        UserSession.__table__.create(
            self.engine, checkfirst=True
        )

        with Session(self.engine) as db:
            da_token = create_session(
                db, db.get(User, "da")
            )
            normal_token = create_session(
                db, db.get(User, "normal")
            )

        def token_identity(
            authorization: str = Header(default=""),
            db: Session = Depends(get_db),
        ):
            if not authorization.lower().startswith("bearer "):
                raise HTTPException(401)

            user = get_user_from_token(
                db, authorization.split(" ", 1)[1]
            )

            if not user or not user.is_active:
                raise HTTPException(401)

            return user

        app = self.client.app

        previous = app.dependency_overrides[
            main.current_user
        ]

        app.dependency_overrides[
            main.current_user
        ] = token_identity

        def request(token):
            return self.client.post(
                "/v1/admin/explore/posts/1/remove",
                headers={
                    "Authorization": "Bearer " + token
                },
                json={"reason": "Uygunsuz icerik"}
            )

        # Isolate unrelated appearance refresh.
        appearance = SimpleNamespace(
            refresh_user=lambda *a, **k: False
        )

        try:
            with patch.dict(sys.modules, {
                "backend.app.appearance_refresh": appearance
            }):
                self.assertEqual(
                    request("fake-token").status_code, 401
                )

                self.assertEqual(
                    request(normal_token).status_code, 403
                )

                self.assertEqual(
                    request(da_token).status_code, 200
                )

                with Session(self.engine) as db:
                    revoke_session(db, da_token)

                self.assertEqual(
                    request(da_token).status_code, 401
                )
        finally:
            app.dependency_overrides[
                main.current_user
            ] = previous


if __name__ == "__main__":
    unittest.main()
