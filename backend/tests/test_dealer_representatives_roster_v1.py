"""Authorized LB/BT roster, activity signals, and revocation tests (SQLite only)."""
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
import pytest
from sqlalchemy import select

from backend.app import dealer_routes as d
from test_representatives_v3 import RepresentativeV3Tests


class DealerRepresentativeRosterTests(RepresentativeV3Tests):
    def setUp(self):
        super().setUp()
        d.DealerRepresentativePresence.__table__.create(bind=self.engine, checkfirst=True)

    def heartbeat(self, actor=None):
        return self.routes['/v1/dealers/representatives/heartbeat'](
            db=self.db, user=actor or self.target)

    def roster(self, actor=None):
        return self.routes['/v1/dealers/representatives'](
            db=self.db, user=actor or self.admin)

    def test_13_only_bt_can_publish_online(self):
        self.assign('dealer')
        with pytest.raises(HTTPException) as exc:
            self.heartbeat()
        assert exc.value.status_code == 403
        self.assign('support')
        assert self.heartbeat()['ok'] is True

    def test_14_online_rep_visible_to_dealer(self):
        self.assign('support')
        self.heartbeat()
        result = self.roster(actor=self.target)
        assert len(result['items']) == 1
        assert result['items'][0]['user_id'] == self.target.id
        assert result['items'][0]['online'] is True
        assert result['online_count'] == 1

    def test_15_stale_representative_offline(self):
        self.assign('support')
        self.heartbeat()
        row = self.db.get(d.DealerRepresentativePresence, self.target.id)
        row.last_seen_at = datetime.now(timezone.utc) - timedelta(minutes=5)
        self.db.commit()
        result = self.roster(actor=self.target)
        assert result['items'][0]['online'] is False
        assert result['online_count'] == 0

    def test_16_revoked_bt_cannot_reappear(self):
        self.assign('support')
        self.heartbeat()
        self.revoke()
        with pytest.raises(HTTPException) as exc:
            self.heartbeat()
        assert exc.value.status_code == 403
        self.assign('dealer')
        assert self.roster(actor=self.target)['items'] == []

    def test_17_unauthorized_user_cannot_list(self):
        self.assign('support')
        with pytest.raises(HTTPException) as exc:
            self.roster(actor=self.admin)
        assert exc.value.status_code == 403
