from io import BytesIO

import pytest
from PIL import Image
from fastapi import HTTPException

from backend.app.nobility_avatar import (
    validate_animation,
    MAX_BYTES,
)


def animation(fmt="GIF", size=(128, 128),
              duration=200, frames=2):
    images = [
        Image.new(
            "RGB",
            size,
            (i % 256, (i * 17) % 256, 100),
        )
        for i in range(frames)
    ]

    buf = BytesIO()

    images[0].save(
        buf,
        format=fmt,
        save_all=True,
        append_images=images[1:],
        duration=duration,
        loop=0,
    )

    return buf.getvalue()


@pytest.mark.parametrize(
    "fmt,mime",
    [
        ("GIF", "image/gif"),
        ("WEBP", "image/webp"),
    ],
)
def test_valid_animation(fmt, mime):
    assert validate_animation(
        animation(fmt)
    ) == mime


@pytest.mark.parametrize("fmt", ["GIF", "WEBP"])
def test_maximum_dimensions(fmt):
    assert validate_animation(
        animation(fmt, size=(512, 512))
    )


@pytest.mark.parametrize("fmt", ["GIF", "WEBP"])
def test_excessive_width(fmt):
    with pytest.raises(HTTPException):
        validate_animation(
            animation(fmt, size=(513, 128))
        )


@pytest.mark.parametrize("fmt", ["GIF", "WEBP"])
def test_excessive_height(fmt):
    with pytest.raises(HTTPException):
        validate_animation(
            animation(fmt, size=(128, 513))
        )


@pytest.mark.parametrize("fmt", ["GIF", "WEBP"])
def test_static_image(fmt):
    with pytest.raises(HTTPException):
        validate_animation(
            animation(fmt, frames=1)
        )


@pytest.mark.parametrize("fmt", ["GIF", "WEBP"])
def test_maximum_duration(fmt):
    assert validate_animation(
        animation(fmt, duration=5000)
    )


@pytest.mark.parametrize("fmt", ["GIF", "WEBP"])
def test_excessive_duration(fmt):
    with pytest.raises(HTTPException):
        validate_animation(
            animation(fmt, duration=6000)
        )


@pytest.mark.parametrize(
    "data",
    [
        b"",
        b"fake-animation",
        b"<svg></svg>",
        b"GIF89a",
        None,
        "not-bytes",
        bytearray(b"invalid"),
    ],
)
def test_invalid_media(data):
    with pytest.raises(HTTPException):
        validate_animation(data)


def test_excessive_bytes():
    with pytest.raises(HTTPException) as exc:
        validate_animation(
            b"x" * (MAX_BYTES + 1)
        )

    assert exc.value.status_code == 413


@pytest.mark.parametrize("fmt", ["PNG", "JPEG"])
def test_unsupported_format(fmt):
    buf = BytesIO()

    Image.new("RGB", (128, 128)).save(
        buf, format=fmt
    )

    with pytest.raises(HTTPException):
        validate_animation(buf.getvalue())


def test_excessive_frames():
    with pytest.raises(HTTPException):
        validate_animation(
            animation(
                size=(16, 16),
                duration=40,
                frames=151,
            )
        )
