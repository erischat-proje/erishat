"""Contract tests for PayTR adapter, using an isolated SQLite copy of its models."""
import importlib
import os
import pathlib
import shutil
import sys
from urllib.parse import urlencode

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Boolean, Integer, String, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from sqlalchemy.pool import StaticPool

SOURCE = pathlib.Path(__file__).resolve().parents[1] / "backend" / "app"

@pytest.fixture
def env(tmp_path, monkeypatch):
    root = tmp_path / "app"
    root.mkdir()
    (root / "__init__.py").write_text("")
    for name in ("paytr_models.py", "paytr_routes.py"):
        shutil.copyfile(SOURCE / name, root / name)
    (root / "db.py").write_text('''from sqlalchemy.orm import DeclarativeBase
class Base(DeclarativeBase): pass
def get_db(): raise RuntimeError("overridden")
''')
    (root / "models.py").write_text('''from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base
class User(Base):
    __tablename__="users"
    id: Mapped[str]=mapped_column(String(64),primary_key=True)
    lidya: Mapped[int]=mapped_column(Integer,default=0)
    is_active: Mapped[bool]=mapped_column(Boolean,default=True)
    google_email: Mapped[str]=mapped_column(String(200),default="test@example.com")
''')
    (root / "admin_models.py").write_text('''from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base
class AdminRole(Base):
    __tablename__="admin_roles"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"),primary_key=True)
    role: Mapped[str] = mapped_column(String(2),nullable=False)
''')
    (root / "purchase_routes.py").write_text('PACKAGES=[{"id":1,"price_try":20,"total":1000}]\n')
    monkeypatch.syspath_prepend(str(tmp_path))
    for name in list(sys.modules):
        if name == "app" or name.startswith("app."):
            del sys.modules[name]
    routes = importlib.import_module("app.paytr_routes")
    models = importlib.import_module("app.models")
    orders = importlib.import_module("app.paytr_models")
    dbmod = importlib.import_module("app.db")
    engine = create_engine("sqlite+pysqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    dbmod.Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    with factory() as db:
        db.add(models.User(id="a",lidya=0,is_active=True,google_email="test@example.com"))
        db.add(orders.PayTROrder(oid="LC"+"A"*32,user_id="a",package_id=1,amount_kurus=2000,
                                 lidya_total=1000,status="pending",test_mode=0))
        db.commit()
    def provide_db():
        with factory() as db: yield db
    def current_user():
        with factory() as db: return db.get(models.User,"a")
    routes.register_auth(current_user)
    api = FastAPI()
    api.include_router(routes.router)
    api.dependency_overrides[dbmod.get_db] = provide_db
    monkeypatch.setenv("PAYTR_MERCHANT_ID","123")
    monkeypatch.setenv("PAYTR_MERCHANT_KEY","secretkey")
    monkeypatch.setenv("PAYTR_MERCHANT_SALT","secretsalt")
    monkeypatch.setenv("PAYTR_ENABLED","1")
    monkeypatch.setenv("PAYTR_TEST_MODE","0")
    yield TestClient(api), routes, factory, models.User, orders.PayTROrder


def notification(routes, **extra):
    data={"merchant_oid":"LC"+"A"*32,"status":"success","total_amount":"2000",
          "payment_amount":"2000","currency":"TL","payment_type":"card"}
    data.update(extra)
    data["hash"]=routes.callback_hash(data["merchant_oid"],"secretsalt",data["status"],data["total_amount"],b"secretkey")
    return data


def post(client, data):
    return client.post("/v1/paytr/callback", data=data)


def test_success_and_replay_do_not_double_credit(env):
    client, routes, factory, User, Order = env
    body = notification(routes)
    assert post(client,body).text == "OK"
    assert post(client,body).text == "OK"
    with factory() as db:
        assert db.get(User,"a").lidya == 1000
        assert db.get(Order,body["merchant_oid"]).status == "paid"


def test_invalid_signature_never_credits(env):
    client, routes, factory, User, _ = env
    body=notification(routes)
    body["hash"]="A"*43+"="
    assert post(client,body).status_code == 403
    with factory() as db: assert db.get(User,"a").lidya == 0


def test_lower_amount_never_credits(env):
    client, routes, factory, User, _ = env
    body=notification(routes,total_amount="1999")
    assert post(client,body).status_code == 409
    with factory() as db: assert db.get(User,"a").lidya == 0


def test_wrong_original_amount_never_credits(env):
    client, routes, factory, User, _ = env
    assert post(client,notification(routes,payment_amount="1999")).status_code == 409
    with factory() as db: assert db.get(User,"a").lidya == 0


def test_test_callback_cannot_demote_real_order(env):
    client, routes, factory, User, _ = env
    assert post(client,notification(routes,test_mode="1")).status_code == 409
    with factory() as db: assert db.get(User,"a").lidya == 0


def test_failed_finalizes_without_balance(env):
    client, routes, factory, User, Order = env
    body=notification(routes,status="failed",failed_reason_code="07")
    assert post(client,body).text == "OK"
    assert post(client,body).text == "OK"
    with factory() as db:
        assert db.get(User,"a").lidya == 0
        row=db.get(Order,body["merchant_oid"])
        assert row.status == "failed" and row.failure_code == "07"


def test_duplicated_form_fields_rejected(env):
    client, routes, factory, User, _ = env
    data=notification(routes)
    encoded=urlencode(data)+"&merchant_oid="+data["merchant_oid"]
    response=client.post("/v1/paytr/callback",content=encoded,headers={"content-type":"application/x-www-form-urlencoded"})
    assert response.status_code == 400
    with factory() as db: assert db.get(User,"a").lidya == 0


def test_disabled_provider_refuses_callback(env, monkeypatch):
    client, routes, factory, User, _ = env
    monkeypatch.setenv("PAYTR_ENABLED","0")
    assert post(client,notification(routes)).status_code == 503
    with factory() as db: assert db.get(User,"a").lidya == 0


def test_order_owner_and_status(env):
    client, routes, factory, User, _ = env
    r=client.get("/v1/paytr/orders/LC"+"A"*32)
    assert r.status_code==200 and r.json()["status"] == "pending"
    assert client.get("/v1/paytr/orders/not-present").status_code == 404


def test_wrong_payment_type_blocked(env):
    client, routes, factory, User, _ = env
    assert post(client,notification(routes,payment_type="invalid")).status_code == 409
    with factory() as db: assert db.get(User,"a").lidya == 0

def test_dispute_requires_da(env):
    client, routes, factory, User, _ = env
    body={"kind":"refund","amount_kurus":2000,"note":"Müşteri geri ödeme talebi"}
    assert client.post("/v1/paytr/admin/disputes/LC"+"A"*32,json=body).status_code == 403

def test_da_creates_case_but_no_money_moves(env):
    client, routes, factory, User, Order = env
    with factory() as db:
        from app.admin_models import AdminRole
        db.add(AdminRole(user_id="a",role="DA"))
        db.commit()
    post(client,notification(routes))
    body={"kind":"refund","amount_kurus":2000,"note":"Tam iade incelemesi"}
    r=client.post("/v1/paytr/admin/disputes/LC"+"A"*32,json=body)
    assert r.status_code == 200
    assert r.json()["state"] == "review"
    with factory() as db:
        assert db.get(User,"a").lidya == 1000
        assert db.get(Order,"LC"+"A"*32).status == "paid"


def test_refund_money_format_and_signature(env):
    _, routes, _, _, _ = env
    import hmac
    assert routes.refund_quote(1234) == "12.34"
    assert routes.refund_quote(100) == "1.00"
    with pytest.raises(ValueError):
        routes.refund_quote(0)
    with pytest.raises(ValueError):
        routes.refund_quote(1.25)
    assert hmac.compare_digest(routes.refund_hash("123", "O123", "12.34", b"secretkey", "secretsalt"),
                               routes.refund_hash("123", "O123", "12.34", b"secretkey", "secretsalt"))

def test_missing_optional_test_flag_live_callback(env):
    client, routes, factory, User, _ = env
    body = notification(routes)
    assert "test_mode" not in body
    assert post(client,body).status_code == 200
    with factory() as db:
        assert db.get(User,"a").lidya == 1000
