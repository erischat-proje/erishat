from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "ErisChat API"
    environment: str = "production"
    database_url: str = "postgresql+psycopg://erischat:erischat@localhost:5432/erischat"
    cors_origins: str = "*"
    db_pool_size: int = 5
    db_max_overflow: int = 10
    db_pool_timeout: int = 30
    db_pool_recycle: int = 1800
    initial_da_ids: str = ""
    initial_da_public_ids: str = ""
    google_client_id: str = ""

    initial_da_google_emails: str = ""
    otp_expiry_seconds: int = 300
    otp_resend_cooldown_seconds: int = 60
    otp_max_attempts: int = 5
    otp_length: int = 6
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = "erischat@erischat.com"
    smtp_use_tls: bool = True
    gmail_client_id: str = ""
    gmail_client_secret: str = ""
    gmail_refresh_token: str = ""
    gmail_from_email: str = "erischat@erischat.com"
    rtc_turn_url: str = ""
    rtc_turn_username: str = ""
    rtc_turn_credential: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
