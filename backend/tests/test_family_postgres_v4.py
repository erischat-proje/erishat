"""Family V4 isolated PostgreSQL privacy tests."""

import os
import uuid
import unittest

from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import make_url
from unittest.mock import patch

import test_family_privacy_v4 as privacy


class FamilyPostgresV4(privacy.FamilyPrivacyV4):

    def setUp(self):
        raw = os.environ.get("FAMILY_V4_TEST_DATABASE_URL")

        if not raw:
            self.skipTest("PostgreSQL test URL tanimli degil")

        url = make_url(raw)

        if not url.drivername.startswith("postgresql"):
            raise RuntimeError("PostgreSQL gerekli")

        if url.host not in ("localhost", "127.0.0.1", "::1"):
            raise RuntimeError("Canli veritabani yasak")

        if url.database != "lidyachat_security_test":
            raise RuntimeError("Izole test veritabani gerekli")

        if os.environ.get("FAMILY_V4_ISOLATED_CONFIRM") != "YES":
            raise RuntimeError("Izolasyon onayi gerekli")

        schema = "family_v4_" + uuid.uuid4().hex

        admin = create_engine(raw)
        self.addCleanup(admin.dispose)

        with admin.begin() as conn:
            conn.execute(text("CREATE SCHEMA " + schema))

        def drop_schema():
            with admin.begin() as conn:
                conn.execute(
                    text("DROP SCHEMA IF EXISTS " + schema + " CASCADE")
                )

        self.addCleanup(drop_schema)

        engine = create_engine(raw)
        self.addCleanup(engine.dispose)

        @event.listens_for(engine, "connect")
        def configure_schema(connection, record):
            with connection.cursor() as cursor:
                cursor.execute("SET search_path TO " + schema)
            connection.commit()

        with patch.object(
            privacy, "create_engine", return_value=engine
        ):
            super().setUp()
