from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    cors_origins: str = "http://localhost:3000"

    secret_key: str = "valhalla-super-secret-key-2026"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 480

    # Wazuh Manager API
    wazuh_api: str = "https://wazuh.manager:55000"
    wazuh_user: str = "wazuh-wui"
    wazuh_pass: str = "wazuh-wui"

    # OpenSearch / Wazuh Indexer
    opensearch_url: str = "https://wazuh.indexer:9200"
    opensearch_user: str = "admin"
    opensearch_pass: str = "admin"

    # Ollama
    ollama_base_url: str = "http://ollama:11434"
    ollama_model: str = "qwen2.5:3b-instruct"
    ollama_temperature: float = 0.0
    ollama_timeout_seconds: float = 45.0

    # VirusTotal
    virustotal_api_key: str = ""

    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()  # type: ignore[call-arg]

