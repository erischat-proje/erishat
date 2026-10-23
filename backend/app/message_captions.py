"""Media captions share the message's lifetime, visibility and search text."""
from fastapi import HTTPException

LIMIT = 1000


def clean(value: str, kind: str, view_seconds: int = 0) -> str:
    value = value.replace('\r\n', '\n').replace('\r', '\n').strip()
    if len(value) > LIMIT or any(ord(c) < 32 and c not in '\n\t' or ord(c) == 127 for c in value):
        raise HTTPException(422, 'Açıklama en fazla 1000 karakter olmalı ve geçersiz kontrol karakteri içermemeli.')
    if value and (kind not in {'image', 'video', 'document'} or view_seconds):
        raise HTTPException(422, 'Açıklama yalnızca normal fotoğraf, video ve belgelerde kullanılabilir.')
    return value


def prefix(kind: str, filename: str | None = None) -> str | None:
    return {'image':'[Fotoğraf]', 'video':'[Video]', 'document':'[Belge]'+(' '+filename if filename else ''), 'voice':'[Sesli mesaj]'}.get(kind)


def text(kind: str, filename: str, caption: str) -> str:
    head = prefix(kind, filename)
    return head + ('\n' + caption if caption else '')


def extract(value: str, kind: str | None, filename: str | None = None) -> str | None:
    if kind not in {'image', 'video', 'document'}:
        return None
    head = prefix(kind, filename) + '\n'
    if not value.startswith(head):
        return None
    return value[len(head):] or None
