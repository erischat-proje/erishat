from email.message import EmailMessage
import base64
import requests

from .config import settings

GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token"
GMAIL_PROFILE_URL = "https://gmail.googleapis.com/gmail/v1/users/me/profile"
GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"


def _get_access_token() -> str:
    if not settings.gmail_client_id:
        raise RuntimeError("GMAIL_CLIENT_ID yapılandırılmamış")
    if not settings.gmail_client_secret:
        raise RuntimeError("GMAIL_CLIENT_SECRET yapılandırılmamış")
    if not settings.gmail_refresh_token:
        raise RuntimeError("GMAIL_REFRESH_TOKEN yapılandırılmamış")

    response = requests.post(
        GMAIL_TOKEN_URL,
        data={
            "client_id": settings.gmail_client_id,
            "client_secret": settings.gmail_client_secret,
            "refresh_token": settings.gmail_refresh_token,
            "grant_type": "refresh_token",
        },
        timeout=15,
    )
    response.raise_for_status()

    access_token = response.json().get("access_token")
    if not access_token:
        raise RuntimeError("Gmail access token alınamadı")

    return access_token


def send_gmail_message(
    recipient: str,
    subject: str,
    body: str,
) -> None:
    message = EmailMessage()
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content(body)

    raw = base64.urlsafe_b64encode(
        message.as_bytes()
    ).decode("ascii")

    access_token = _get_access_token()

    response = requests.post(
        GMAIL_SEND_URL,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        json={"raw": raw},
        timeout=15,
    )
    response.raise_for_status()

    print(
        "GMAIL_SEND_RESPONSE:",
        response.text,
        flush=True,
    )
