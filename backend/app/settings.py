from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    cors_origins: str = "http://localhost:3000"

    secret_key: str = "valhalla-super-secret-key-2026"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 480

    wazuh_api: str = "https://localhost:55000"
    wazuh_user: str = "wazuh-wui"
    wazuh_pass: str = "wazuh-wui"

    ollama_base_url: str = "http://ollama:11434"
    ollama_model: str = "qwen2.5:3b-instruct"
    ollama_temperature: float = 0.0
    ollama_timeout_seconds: float = 45.0

    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()  # type: ignore[call-arg]

