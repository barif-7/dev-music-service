from __future__ import annotations

import json
import hashlib
from abc import ABC, abstractmethod
from pathlib import Path

from config import Settings


class FocusProfileStorage(ABC):
    """Storage boundary for focus profile persistence."""

    @abstractmethod
    def load(self) -> dict | None:
        """Return the stored profile, or None when no profile exists."""

    @abstractmethod
    def save(self, profile: dict) -> None:
        """Persist a profile."""

    @abstractmethod
    def reset(self) -> None:
        """Delete the stored profile."""


class LocalJsonFocusProfileStorage(FocusProfileStorage):
    def __init__(self, path: Path) -> None:
        self.path = path

    def load(self) -> dict | None:
        try:
            return json.loads(self.path.read_text())
        except (FileNotFoundError, json.JSONDecodeError):
            return None

    def save(self, profile: dict) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(profile, indent=2))

    def reset(self) -> None:
        self.path.unlink(missing_ok=True)


class KvFocusProfileStorageStub(FocusProfileStorage):
    """Placeholder for hosted KV providers without coupling the app to one."""

    def __init__(self, namespace: str | None) -> None:
        self.namespace = namespace

    def _not_configured(self) -> RuntimeError:
        target = self.namespace or "unset namespace"
        return RuntimeError(f"KV focus profile storage is not wired ({target})")

    def load(self) -> dict | None:
        raise self._not_configured()

    def save(self, profile: dict) -> None:
        raise self._not_configured()

    def reset(self) -> None:
        raise self._not_configured()


def build_focus_profile_storage(
    settings: Settings, user_id: str | None = None
) -> FocusProfileStorage:
    if settings.focus_profile_storage_backend == "kv":
        namespace = settings.focus_profile_kv_namespace
        if user_id:
            namespace = f"{namespace or 'focus'}:{_user_storage_key(user_id)}"
        return KvFocusProfileStorageStub(namespace)
    if not user_id:
        return LocalJsonFocusProfileStorage(settings.focus_profile_path)
    path = settings.dms_data_dir / "users" / _user_storage_key(user_id) / "focus_profile.json"
    return LocalJsonFocusProfileStorage(path)


def _user_storage_key(user_id: str) -> str:
    """Stable pseudonymous directory name; never place an email in a path."""
    return hashlib.sha256(user_id.strip().lower().encode()).hexdigest()[:24]
