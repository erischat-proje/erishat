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
    google_client_id: str = ""
    initial_da_google_emails: str = ""
    rtc_turn_url: str = ""
    rtc_turn_username: str = ""
    rtc_turn_credential: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
