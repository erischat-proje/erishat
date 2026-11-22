"""LidyaChat V3 - Dealer evidence validation."""

import base64
import binascii
import hashlib
import re
from io import BytesIO

from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError

MAX_BYTES = 5 * 1024 * 1024

ALLOWED = {
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WEBP",
    "application/pdf": "PDF",
}


def validate_evidence(value: str):
    if not isinstance(value, str):
        raise HTTPException(422, "Dekont gerekli")

    if len(value) > 7_100_000:
        raise HTTPException(413, "Dekont en fazla 5 MB olabilir")

    match = re.fullmatch(
        r"data:(image/(?:jpeg|png|webp)|application/pdf)"
        r";base64,([A-Za-z0-9+/]+={0,2})",
        value
    )

    if not match:
        raise HTTPException(422, "Desteklenmeyen dekont türü")

    mime = match.group(1)

    try:
        raw = base64.b64decode(
            match.group(2), validate=True
        )
    except (ValueError, binascii.Error):
        raise HTTPException(422, "Geçersiz dekont")

    if not raw:
        raise HTTPException(422, "Boş dekont yüklenemez")

    if len(raw) > MAX_BYTES:
        raise HTTPException(413, "Dekont en fazla 5 MB olabilir")

    if mime == "application/pdf":
        if not raw.startswith(b"%PDF-"):
            raise HTTPException(422, "Geçersiz PDF")

        if b"%%EOF" not in raw[-2048:]:
            raise HTTPException(422, "Eksik PDF dosyası")
    else:
        try:
            with Image.open(BytesIO(raw)) as img:
                if img.format != ALLOWED[mime]:
                    raise ValueError("Format uyumsuz")

                if img.width * img.height > 20_000_000:
                    raise ValueError("Görsel çok büyük")

                img.verify()
        except (
            UnidentifiedImageError,
            ValueError,
            OSError,
            Image.DecompressionBombError
        ):
            raise HTTPException(422, "Geçersiz görsel")

    return {
        "content": raw,
        "mime_type": mime,
        "sha256": hashlib.sha256(raw).hexdigest(),
        "size": len(raw),
    }
