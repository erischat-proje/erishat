"""Brand names reserved against staff impersonation."""
import unicodedata

def validate_username(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("Kullanıcı adı boş olamaz")
    normalized = unicodedata.normalize("NFKD", value).casefold()
    normalized = "".join(c for c in normalized if c.isalnum() and not unicodedata.combining(c))
    if "eris" in normalized or "chat" in normalized:
        raise ValueError("Bu kullanıcı adı uygulama markasına ayrılmıştır.")
    return value
