import base64
from io import BytesIO

import pytest
from fastapi import HTTPException
from PIL import Image

from backend.app.dealer_evidence_v3 import validate_evidence


def document(mime, data):
    encoded = base64.b64encode(data).decode()
    return f"data:{mime};base64,{encoded}"


def test_valid_png():
    buffer = BytesIO()
    Image.new("RGB", (10, 10)).save(buffer, "PNG")
    result = validate_evidence(
        document("image/png", buffer.getvalue())
    )
    assert result["mime_type"] == "image/png"
    assert len(result["sha256"]) == 64


def test_missing_document():
    with pytest.raises(HTTPException):
        validate_evidence("")


def test_fake_pdf():
    with pytest.raises(HTTPException):
        validate_evidence(
            document("application/pdf", b"fake document")
        )


def test_fake_image():
    with pytest.raises(HTTPException):
        validate_evidence(
            document("image/png", b"fake image")
        )


def test_oversized_document():
    with pytest.raises(HTTPException) as error:
        validate_evidence(
            document("application/pdf", b"x" * 5_300_000)
        )
    assert error.value.status_code == 413
