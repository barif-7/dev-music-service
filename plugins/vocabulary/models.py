import unicodedata
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CleanModel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class WordInput(CleanModel):
    word: str = Field(min_length=1, max_length=120)
    source_language: str = Field(default="en", min_length=2, max_length=35)
    definition_language: str = Field(default="en", min_length=2, max_length=35)
    meaning: str = Field(default="", max_length=3000)
    translation: str = Field(default="", max_length=500)
    example: str = Field(default="", max_length=2000)
    personal_sentence: str = Field(default="", max_length=2000)
    collocations: list[str] = Field(default_factory=list, max_length=8)
    register_label: str = Field(default="", max_length=160)
    context: str = Field(default="", max_length=3000)
    source_title: str = Field(default="", max_length=300)
    source_artist: str = Field(default="", max_length=300)
    source_url: str = Field(default="", max_length=2000)
    source_time: float | None = Field(default=None, ge=0, le=86400)
    provenance: Literal["manual", "local-model", "legacy"] = "manual"
    model: str = Field(default="", max_length=120)

    @field_validator("word")
    @classmethod
    def normalize_word(cls, value: str) -> str:
        value = unicodedata.normalize("NFKC", value).strip()
        if not value or not any(c.isalnum() for c in value):
            raise ValueError("Enter a word or phrase")
        return value

    @field_validator("source_language", "definition_language")
    @classmethod
    def normalize_language(cls, value: str) -> str:
        return value.lower().replace("_", "-")

    @field_validator("collocations")
    @classmethod
    def bounded_collocations(cls, value: list[str]) -> list[str]:
        if any(len(item) > 200 for item in value):
            raise ValueError("Phrases must be at most 200 characters")
        return [item.strip() for item in value if item.strip()]


class WordEdit(WordInput):
    revision: int = Field(ge=0)
    archived: bool = False


class LookupInput(CleanModel):
    word: str = Field(min_length=1, max_length=120)
    source_language: str = Field(default="en", min_length=2, max_length=35)
    definition_language: str = Field(default="en", min_length=2, max_length=35)
    context: str = Field(default="", max_length=3000)


class Definition(CleanModel):
    meaning: str = Field(max_length=3000)
    translation: str = Field(default="", max_length=500)
    example: str = Field(default="", max_length=2000)
    collocations: list[str] = Field(default_factory=list, max_length=8)
    register_label: str = Field(default="", max_length=160)


class ReviewInput(CleanModel):
    event_id: UUID
    word_id: UUID
    mode: Literal["recognition", "production"]
    rating: Literal["forgot", "difficult", "easy"]
    revision: int = Field(ge=0)


class UsageInput(CleanModel):
    event_id: UUID
    word_id: UUID
    sentence: str = Field(min_length=1, max_length=3000)
    kind: Literal["conversation", "writing", "practice"]


class ImportInput(CleanModel):
    entries: list[WordInput] = Field(max_length=2000)
