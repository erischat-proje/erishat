"""V22 test-only SQLite simulation of the V21 journal's security constraints.

Uses a disposable temporary SQLite database, NEVER the production database.
Not a PSP callback implementation, wallet ledger, or source of payment proof.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
from sqlalchemy import (create_engine, MetaData, Table, Column, String,
                        Integer, DateTime, ForeignKey, UniqueConstraint,
                        CheckConstraint, Index, text, insert, select, func)
from sqlalchemy.exc import IntegrityError

def create_simulated_journal(engine):
    """Simulate the exact core V21 constraints in disposable SQLite.

    This deliberately tests constraint semantics independently of ORM and of
    the live PostgreSQL provider. Full PostgreSQL concurrency still needs
    separate isolated-server testing.
    """
    meta=MetaData()
    parent=Table("woocommerce_web_orders_v6",meta,
                 Column("id",String(36),primary_key=True))
    journal=Table(
        "qnbpay_event_journal_v21",meta,
        Column("id",Integer,primary_key=True,autoincrement=True),
        Column("provider",String(24),nullable=False),
        Column("event_id",String(128),nullable=False),
        Column("transaction_id",String(128),nullable=False),
        Column("order_ref",String(36),ForeignKey(parent.c.id,ondelete="RESTRICT"),nullable=False),
        Column("woocommerce_order_id",Integer,nullable=False),
        Column("package_id",Integer,nullable=False),
        Column("state",String(24),nullable=False,server_default="unverified"),
        UniqueConstraint("provider","event_id",name="uq_qnb_v21_provider_event"),
        CheckConstraint("provider = 'QNBpay'",name="ck_qnb_v21_provider"),
        CheckConstraint("state = 'unverified'",name="ck_qnb_v21_unverified_only"),
        CheckConstraint("woocommerce_order_id > 0",name="ck_qnb_v21_wc_positive"),
        CheckConstraint("package_id BETWEEN 1 AND 16",name="ck_qnb_v21_package"),
        Index("ix_qnb_v21_provider_transaction","provider","transaction_id"),
        Index("ix_qnb_v21_order_ref","order_ref"),
    )
    meta.create_all(engine)
    return parent,journal

def make_disposable_db(path):
    if path.exists():
        raise ValueError("refusing to use an existing SQLite database")
    engine=create_engine(f"sqlite+pysqlite:///{path}",connect_args={"timeout":20})
    with engine.begin() as c:
        c.execute(text("PRAGMA foreign_keys=ON"))
    parent,journal=create_simulated_journal(engine)
    return engine,parent,journal

ORDER_A="dd0959e6-b0fc-4c03-b03f-15e0b7c44c01"
ORDER_B="dd0959e6-b0fc-4c03-b03f-15e0b7c44c02"

def event(**changes):
    fields=dict(provider="QNBpay", event_id="EVENT0001",
                transaction_id="TRANSACTION0001",order_ref=ORDER_A,
                woocommerce_order_id=11,package_id=1,state="unverified")
    fields.update(changes)
    return fields

def duplicate_event_concurrency():
    """Return (successes, duplicate_rejections, final_rows) in a temp DB."""
    with TemporaryDirectory(prefix="lidyachat-v22-") as folder:
        engine,parent,journal=make_disposable_db(Path(folder)/"only-test.db")
        with engine.begin() as con:
            con.execute(insert(parent),[{"id":ORDER_A},{"id":ORDER_B}])
        def claim():
            try:
                with engine.begin() as con:
                    con.execute(text("PRAGMA foreign_keys=ON"))
                    con.execute(insert(journal).values(**event()))
                return "success"
            except IntegrityError:
                return "rejected"
        with ThreadPoolExecutor(max_workers=2) as ex:
            results=list(ex.map(lambda _:claim(),range(2)))
        with engine.connect() as con:
            count=con.scalar(select(func.count()).select_from(journal))
        engine.dispose()
        return results.count("success"),results.count("rejected"),count

if __name__=="__main__":
    a,b,c=duplicate_event_concurrency()
    print("V22 SQLITE DUPLICATE TEST:",f"{a} success, {b} rejected, {c} record")
    if (a,b,c)!=(1,1,1):
        raise SystemExit(1)
    print("PASS - only disposable SQLite used; no Railway, PSP or Coin writes")
