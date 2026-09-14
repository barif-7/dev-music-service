from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class VocabularySettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="VOCABULARY_", extra="ignore")

    db_path: Path = Path.home() / "Library/Application Support/Phase/vocabulary.sqlite3"
    ollama_url: str = "http://127.0.0.1:11434"
    model: str = "llama3.2:latest"
    timezone: str = "America/Toronto"
    lookup_timeout: float = 90.0

    @field_validator("ollama_url")
    @classmethod
    def local_model_only(cls, value: str) -> str:
        parsed = urlsplit(value)
        if (parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}
                or parsed.username or parsed.password or parsed.query or parsed.fragment
                or parsed.path not in {"", "/"}):
            raise ValueError("Vocabulary inference must use a loopback Ollama URL")
        return value.rstrip("/")

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value: str) -> str:
        ZoneInfo(value)
        return value
