import logging
import smtplib
import ssl
from email.message import EmailMessage

from .config import settings
from .gmail_delivery import send_gmail_message

logger = logging.getLogger(__name__)


def _smtp_configured() -> bool:
    return bool(settings.smtp_host and settings.smtp_username and settings.smtp_password)


def _send_smtp_message(recipient: str, subject: str, body: str) -> None:
    message = EmailMessage()
    message["From"] = settings.smtp_from_email
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content(body)
    context = ssl.create_default_context()

    if int(settings.smtp_port) == 465:
        with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15, context=context) as server:
            server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)
        return

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
        if settings.smtp_use_tls:
            server.starttls(context=context)
        server.login(settings.smtp_username, settings.smtp_password)
        server.send_message(message)


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

    gmail_configured = bool(
        settings.gmail_client_id
        and settings.gmail_client_secret
        and settings.gmail_refresh_token
    )

    if gmail_configured:
        try:
            send_gmail_message(recipient=recipient, subject=subject, body=body)
            return
        except Exception:
            if not _smtp_configured():
                raise
            logger.exception("Gmail API ile OTP gönderimi başarısız; SMTP yedeği deneniyor")

    if _smtp_configured():
        _send_smtp_message(recipient=recipient, subject=subject, body=body)
        return

    raise RuntimeError(
        "E-posta gönderim servisi yapılandırılmamış. Gmail API veya SMTP kimlik bilgileri gerekli."
    )
