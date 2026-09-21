from email.message import EmailMessage
import smtplib

from .config import settings


def send_email_otp(
    recipient: str,
    code: str,
    purpose: str,
) -> None:
    if not settings.smtp_host:
        raise RuntimeError("SMTP_HOST yapılandırılmamış")

    if not settings.smtp_username:
        raise RuntimeError("SMTP_USERNAME yapılandırılmamış")

    if not settings.smtp_password:
        raise RuntimeError("SMTP_PASSWORD yapılandırılmamış")

    subject = (
        "ErisChat giriş doğrulama kodun"
        if purpose == "login"
        else "ErisChat kayıt doğrulama kodun"
    )

    message = EmailMessage()
    message["From"] = settings.smtp_from_email
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content(
        f"ErisChat doğrulama kodun: {code}\n\n"
        "Bu kod 5 dakika geçerlidir. "
        "Kodu kimseyle paylaşma."
    )

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
        if settings.smtp_use_tls:
            smtp.starttls()

        smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(message)
