from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    database_url: str
    cors_origins: str = "http://localhost:3000"

    ollama_base_url: str = "http://ollama:11434"
    ollama_model: str = "qwen2.5:3b-instruct"
    ollama_temperature: float = 0.0
    ollama_timeout_seconds: float = 45.0

    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()  # type: ignore[call-arg]

