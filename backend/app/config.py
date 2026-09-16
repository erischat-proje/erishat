from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "ErisChat API"
    environment: str = "development"
    database_url: str = "postgresql+psycopg://erischat:erischat@localhost:5432/erischat"
    cors_origins: str = "*"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
