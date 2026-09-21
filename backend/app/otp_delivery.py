from .config import settings
from .gmail_delivery import send_gmail_message


def send_email_otp(
    recipient: str,
    code: str,
    purpose: str,
) -> None:
    subject = (
        "ErisChat giriş doğrulama kodun"
        if purpose == "login"
        else "ErisChat kayıt doğrulama kodun"
    )

    body = (
        f"ErisChat doğrulama kodun: {code}\n\n"
        "Bu kod 5 dakika geçerlidir. "
        "Kodu kimseyle paylaşma."
    )

    if (
        settings.gmail_client_id
        and settings.gmail_client_secret
        and settings.gmail_refresh_token
    ):
        send_gmail_message(
            recipient=recipient,
            subject=subject,
            body=body,
        )
        return

    raise RuntimeError(
        "Gmail API yapılandırılmamış: "
        "GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET ve "
        "GMAIL_REFRESH_TOKEN gerekli."
    )
