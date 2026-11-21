"""V3 tests: only LB and BT; legacy CT cannot use stock."""
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from backend.app import dealer_routes as d
from test_representatives_v2 import RepresentativeV2Tests

class RepresentativeV3Tests(RepresentativeV2Tests):
    def test_10_coin_assignment_rejected(self):
        with pytest.raises(ValidationError):
            d.AssignBody(public_id="900002", kind="coin")

    def test_11_legacy_coin_cannot_use_dealer_endpoints(self):
        self.assign("dealer")
        self.db.add(d.DealerDesignation(
            user_id=self.target.id, kind="coin", assigned_by=self.admin.id))
        self.db.commit()
        with pytest.raises(HTTPException) as caught:
            self.routes["/v1/dealers/me"](db=self.db,user=self.target)
        assert caught.value.status_code == 403
        result=self.routes["/v1/dealers/badges"](
            ids=self.target.id,db=self.db,user=self.admin)
        assert self.target.id not in result["dealers"]

    def test_12_da_can_convert_legacy_coin_to_lb(self):
        self.assign("dealer")
        self.db.add(d.DealerDesignation(
            user_id=self.target.id, kind="coin", assigned_by=self.admin.id))
        self.db.commit()
        self.assign("dealer")
        self.db.expire_all()
        assert d.designation(self.db,self.target.id) == "dealer"
        assert self.routes["/v1/dealers/me"](
            db=self.db,user=self.target)["badge"] == "LB"
