"""V4: LB / BT cannot modify avatar or frame; role removal restores edit access."""
import pytest
from fastapi import HTTPException
from backend.app import dealer_routes as d
from backend.app.cosmetic_routes import apply_cosmetic
from backend.app.schemas import CosmeticApply, UserUpdate

from test_representatives_v3 import RepresentativeV3Tests


class RepresentativeV4Tests(RepresentativeV3Tests):
    def test_13_lb_avatar_and_frame_locked(self):
        self.assign('dealer')
        for kind in ('avatar', 'frame'):
            with pytest.raises(HTTPException) as exc:
                apply_cosmetic(CosmeticApply(cosmetic_type=kind, asset_key='unused'),
                               user=self.target, db=self.db)
            assert exc.value.status_code == 403

    def test_14_bt_avatar_and_frame_locked(self):
        self.assign('support')
        for kind in ('avatar', 'frame'):
            with pytest.raises(HTTPException) as exc:
                d.require_role_cosmetics_unlocked(self.db, self.target.id)
            assert exc.value.status_code == 403

    def test_15_revoked_role_unlocks_without_deleting_assets(self):
        self.assign('dealer')
        self.target._avatar_asset = 'owned-original-avatar'
        self.target._frame_asset = 'owned-original-frame'
        self.db.commit()
        self.revoke()
        d.require_role_cosmetics_unlocked(self.db, self.target.id)
        self.db.refresh(self.target)
        assert self.target._avatar_asset == 'owned-original-avatar'
        assert self.target._frame_asset == 'owned-original-frame'

    def test_16_plain_user_can_edit(self):
        d.require_role_cosmetics_unlocked(self.db, self.target.id)

    def test_17_emoji_avatar_guard_precedes_assignment(self):
        import ast
        from pathlib import Path

        source = Path("backend/app/main.py").read_text()
        tree = ast.parse(source)
        fn = next(
            node for node in tree.body
            if isinstance(node, ast.FunctionDef)
            and node.name == "update_me"
        )

        guards = [
            node.lineno for node in ast.walk(fn)
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id == "require_role_cosmetics_unlocked"
        ]

        assignments = [
            node.lineno for node in ast.walk(fn)
            if isinstance(node, ast.Assign)
            and any(
                isinstance(target, ast.Attribute)
                and isinstance(target.value, ast.Name)
                and target.value.id == "user"
                and target.attr == "avatar"
                for target in node.targets
            )
        ]

        assert len(guards) == 1
        assert len(assignments) == 1
        assert guards[0] < assignments[0]
