"""Zorunlu dekontlu transfer ve tekrar işlem testleri."""
from uuid import uuid4

from backend.app import dealer_routes as dealers
from backend.tests.test_dealer_security_v6 import (
    DealerSecurityTests, TEST_EVIDENCE
)


class EvidenceTransferTests(DealerSecurityTests):

    def test_v4_evidence_saved_with_transfer(self):
        self.grant(5000)
        result = self.transfer(1000)

        evidence = self.db.get(
            dealers.DealerTransferEvidence,
            result["transfer_id"]
        )

        self.assertIsNotNone(evidence)
        self.assertEqual(evidence.uploaded_by, self.dealer.id)
        self.assertEqual(evidence.mime_type, "image/png")
        self.assertEqual(self.wallet(), 1000)
        self.assertEqual(self.stock(), 4000)

    def test_v4_replay_does_not_duplicate_evidence(self):
        self.grant(5000)
        key = str(uuid4())

        first = self.transfer(1000, key=key)
        second = self.transfer(1000, key=key)

        self.assertEqual(
            first["transfer_id"],
            second["transfer_id"]
        )
        self.assertTrue(second["replayed"])

        evidence = self.db.get(
            dealers.DealerTransferEvidence,
            first["transfer_id"]
        )
        self.assertIsNotNone(evidence)
        self.assertEqual(self.wallet(), 1000)
        self.assertEqual(self.stock(), 4000)

    def test_v4_invalid_evidence_rejected(self):
        self.grant(5000)

        from fastapi import HTTPException

        body = dealers.TransferBody(
            recipient_public_id=self.recipient.public_id,
            amount=1000,
            request_key=str(uuid4()),
            evidence="invalid-evidence"
        )

        self.assert_http(
            422,
            lambda: self.invoke(
                "/v1/dealers/transfer",
                body,
                self.dealer
            )
        )
        self.assertEqual(self.wallet(), 0)
        self.assertEqual(self.stock(), 5000)
