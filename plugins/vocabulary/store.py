"""SQLite is the source of truth; each write is one short, atomic transaction.

Timestamps are UTC Unix seconds. Review directions have independent schedules.
The scheduler is a documented interval ladder, not a claim of FSRS accuracy.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from uuid import uuid4
from zoneinfo import ZoneInfo

from .models import ReviewInput, UsageInput, WordEdit, WordInput

INTERVAL_DAYS = (1, 3, 7, 14, 30, 60, 120)


class StoreError(Exception):
    def __init__(self, message: str, status: int = 409):
        super().__init__(message)
        self.status = status


def _json(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def _identity(data):
    # Separate senses of a word can coexist; repeated capture of a sense adds
    # its source as an encounter without resetting either review schedule.
    parts = [data[k].casefold() for k in (
        "word", "source_language", "definition_language", "meaning", "translation"
    )]
    return hashlib.sha256(_json(parts).encode()).hexdigest()


class VocabularyStore:
    def __init__(self, path: Path, timezone: str = "America/Toronto", clock=time.time):
        self.path = Path(path).expanduser()
        self.timezone = ZoneInfo(timezone)
        self.clock = clock
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS words (
                    id TEXT PRIMARY KEY, identity TEXT NOT NULL UNIQUE,
                    data TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0,
                    created_at REAL NOT NULL, updated_at REAL NOT NULL,
                    revision INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS cards (
                    word_id TEXT NOT NULL REFERENCES words(id), mode TEXT NOT NULL,
                    step INTEGER NOT NULL DEFAULT 0, due_at REAL NOT NULL,
                    review_count INTEGER NOT NULL DEFAULT 0,
                    lapses INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY(word_id, mode)
                );
                CREATE INDEX IF NOT EXISTS cards_due ON cards(mode, due_at);
                CREATE TABLE IF NOT EXISTS events (
                    id TEXT PRIMARY KEY, kind TEXT NOT NULL, request TEXT NOT NULL,
                    response TEXT NOT NULL, created_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS usages (
                    id TEXT PRIMARY KEY, word_id TEXT NOT NULL REFERENCES words(id),
                    sentence TEXT NOT NULL, kind TEXT NOT NULL, created_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS encounters (
                    word_id TEXT NOT NULL REFERENCES words(id), fingerprint TEXT NOT NULL,
                    data TEXT NOT NULL, created_at REAL NOT NULL,
                    PRIMARY KEY(word_id, fingerprint)
                );
                CREATE TABLE IF NOT EXISTS lookup_cache (
                    key TEXT PRIMARY KEY, data TEXT NOT NULL, created_at REAL NOT NULL
                );
                PRAGMA user_version=1;
            """)
        self.path.chmod(0o600)

    @contextmanager
    def connection(self, write=False):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        try:
            if write:
                db.execute("BEGIN IMMEDIATE")
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def _word(self, db, word_id):
        row = db.execute("SELECT * FROM words WHERE id=?", (word_id,)).fetchone()
        if row is None:
            raise StoreError("Word not found", 404)
        return self._decode(row)

    @staticmethod
    def _decode(row):
        result = {**json.loads(row["data"]), **{key: row[key] for key in (
            "id", "created_at", "updated_at", "revision"
        )}, "archived": bool(row["archived"])}
        result["needs_meaning"] = not (result["meaning"] or result["translation"])
        return result

    def _encounter(self, db, word_id, data, now):
        source = {key: data[key] for key in (
            "context", "source_title", "source_artist", "source_url", "source_time"
        )}
        if not any(value not in (None, "") for value in source.values()):
            return
        fingerprint = hashlib.sha256(_json(source).encode()).hexdigest()
        db.execute("INSERT OR IGNORE INTO encounters VALUES (?, ?, ?, ?)",
                   (word_id, fingerprint, _json(source), now))

    def _save(self, db, entry: WordInput):
        data = entry.model_dump()
        now = self.clock()
        identity = _identity(data)
        found = db.execute("SELECT id FROM words WHERE identity=?", (identity,)).fetchone()
        created = found is None
        word_id = str(uuid4()) if created else found["id"]
        if created:
            db.execute("INSERT INTO words VALUES (?, ?, ?, 0, ?, ?, 0)",
                       (word_id, identity, _json(data), now, now))
            for mode in ("recognition", "production"):
                db.execute("INSERT INTO cards (word_id, mode, due_at) VALUES (?, ?, ?)",
                           (word_id, mode, now))
        self._encounter(db, word_id, data, now)
        return {"word": self._word(db, word_id), "created": created}

    def save(self, entry: WordInput):
        with self.connection(write=True) as db:
            return self._save(db, entry)

    def import_entries(self, entries):
        with self.connection(write=True) as db:
            results = [self._save(db, entry) for entry in entries]
            return {"imported": sum(r["created"] for r in results),
                    "existing": sum(not r["created"] for r in results)}

    def edit(self, word_id: str, entry: WordEdit):
        with self.connection(write=True) as db:
            old = self._word(db, word_id)
            if old["revision"] != entry.revision:
                raise StoreError("This word changed in another window. Refresh and try again.")
            data = entry.model_dump(exclude={"revision", "archived"})
            try:
                db.execute("""UPDATE words SET data=?, identity=?, archived=?, updated_at=?,
                           revision=revision+1 WHERE id=?""",
                           (_json(data), _identity(data), entry.archived, self.clock(), word_id))
            except sqlite3.IntegrityError as exc:
                raise StoreError("That word and meaning are already in your library.") from exc
            self._encounter(db, word_id, data, self.clock())
            # Invalidates outstanding review cards after a meaning edit/archive.
            db.execute("UPDATE cards SET revision=revision+1 WHERE word_id=?", (word_id,))
            return self._word(db, word_id)

    def get(self, word_id):
        with self.connection() as db:
            word = self._word(db, word_id)
            word["cards"] = [dict(row) for row in db.execute(
                "SELECT * FROM cards WHERE word_id=?", (word_id,))]
            word["usages"] = [dict(row) for row in db.execute(
                "SELECT * FROM usages WHERE word_id=? ORDER BY created_at DESC LIMIT 50", (word_id,))]
            word["encounters"] = [json.loads(row["data"]) for row in db.execute(
                "SELECT data FROM encounters WHERE word_id=? ORDER BY created_at DESC LIMIT 50", (word_id,))]
            return word

    def words(self, query="", status="active", limit=100, offset=0):
        clauses, args = [], []
        if status in {"active", "archived", "inbox"}:
            clauses.append("archived=?")
            args.append(int(status == "archived"))
        if status == "inbox":
            clauses.append("json_extract(data, '$.meaning')='' AND json_extract(data, '$.translation')=''")
        if query:
            # instr treats %, _, and quote characters as literal search text.
            clauses.append("instr(lower(data), lower(?)) > 0")
            args.append(query)
        # Every clause above is a literal this function chose; the caller's
        # status and query reach SQLite only as bound parameters in `args`.
        where = " WHERE " + " AND ".join(clauses) if clauses else ""
        with self.connection() as db:
            total = db.execute("SELECT count(*) FROM words" + where, args).fetchone()[0]  # nosec B608
            rows = db.execute(
                "SELECT * FROM words" + where + " ORDER BY created_at DESC, id LIMIT ? OFFSET ?",  # nosec B608
                [*args, limit, offset],
            )
            return {"words": [self._decode(row) for row in rows], "total": total}

    def due(self, mode="production", limit=20):
        with self.connection() as db:
            rows = db.execute("""SELECT c.* FROM cards c JOIN words w ON w.id=c.word_id
                WHERE c.mode=? AND c.due_at<=? AND w.archived=0
                AND (json_extract(w.data, '$.meaning')!='' OR json_extract(w.data, '$.translation')!='')
                ORDER BY c.due_at, c.word_id LIMIT ?""", (mode, self.clock(), limit))
            return {"cards": [{**dict(row), "word": self._word(db, row["word_id"])} for row in rows]}

    def _event(self, db, event_id, kind, request):
        row = db.execute("SELECT * FROM events WHERE id=?", (event_id,)).fetchone()
        if row:
            if row["kind"] != kind or row["request"] != _json(request):
                raise StoreError("This event ID was already used for a different action.")
            return json.loads(row["response"])

    def review(self, entry: ReviewInput):
        payload = entry.model_dump(mode="json")
        word_id, event_id = str(entry.word_id), str(entry.event_id)
        with self.connection(write=True) as db:
            existing = self._event(db, event_id, "review", payload)
            if existing:
                return existing
            word = self._word(db, word_id)
            card = db.execute("SELECT * FROM cards WHERE word_id=? AND mode=?",
                              (word_id, entry.mode)).fetchone()
            if word["archived"] or word["needs_meaning"]:
                raise StoreError("Add a meaning and restore the word before reviewing it.")
            if card["revision"] != entry.revision or card["due_at"] > self.clock():
                raise StoreError("This review has already changed. Refresh your review queue.")
            step = card["step"]
            if entry.rating == "forgot":
                step, interval = 0, 600
            elif entry.rating == "difficult":
                interval = 86400
            else:
                interval = INTERVAL_DAYS[min(step, len(INTERVAL_DAYS) - 1)] * 86400
                step = min(step + 1, len(INTERVAL_DAYS))
            now = self.clock()
            db.execute(
                """UPDATE cards SET step=?, due_at=?, review_count=review_count+1,
                lapses=lapses+?, revision=revision+1 WHERE word_id=? AND mode=?""",
                (step, now + interval, int(entry.rating == "forgot"), word_id, entry.mode),
            )
            result = dict(db.execute("SELECT * FROM cards WHERE word_id=? AND mode=?",
                                     (word_id, entry.mode)).fetchone())
            db.execute("INSERT INTO events VALUES (?, 'review', ?, ?, ?)",
                       (event_id, _json(payload), _json(result), now))
            return result

    def usage(self, entry: UsageInput):
        payload = entry.model_dump(mode="json")
        word_id, event_id = str(entry.word_id), str(entry.event_id)
        with self.connection(write=True) as db:
            existing = self._event(db, event_id, "usage", payload)
            if existing:
                return existing
            self._word(db, word_id)
            now = self.clock()
            result = {"id": event_id, "word_id": word_id, "sentence": entry.sentence,
                      "kind": entry.kind, "created_at": now}
            db.execute("INSERT INTO usages VALUES (?, ?, ?, ?, ?)",
                       (event_id, word_id, entry.sentence, entry.kind, now))
            db.execute("INSERT INTO events VALUES (?, 'usage', ?, ?, ?)",
                       (event_id, _json(payload), _json(result), now))
            return result

    def overview(self):
        now = self.clock()
        start = datetime.fromtimestamp(now, self.timezone).replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
        with self.connection() as db:
            counts = {"total": db.execute("SELECT count(*) FROM words").fetchone()[0]}
            counts["active"] = db.execute("SELECT count(*) FROM words WHERE archived=0").fetchone()[0]
            counts["needs_meaning"] = db.execute("""SELECT count(*) FROM words WHERE archived=0
                AND json_extract(data, '$.meaning')='' AND json_extract(data, '$.translation')=''""").fetchone()[0]
            counts["due"] = {"recognition": 0, "production": 0}
            counts["due"].update({row["mode"]: row["n"] for row in db.execute("""
                SELECT c.mode, count(*) n FROM cards c JOIN words w ON w.id=c.word_id
                WHERE w.archived=0 AND c.due_at<=? AND
                (json_extract(w.data, '$.meaning')!='' OR json_extract(w.data, '$.translation')!='')
                GROUP BY c.mode""", (now,))})
            counts["reviewed_today"] = db.execute(
                "SELECT count(*) FROM events WHERE kind='review' AND created_at>=?", (start,)).fetchone()[0]
            counts["used_today"] = db.execute("""SELECT count(DISTINCT word_id) FROM usages
                WHERE kind!='practice' AND created_at>=?""", (start,)).fetchone()[0]
            counts["new_today"] = db.execute("SELECT count(*) FROM words WHERE created_at>=?", (start,)).fetchone()[0]
            counts["timezone"] = str(self.timezone)
            return counts

    def cached(self, key):
        with self.connection() as db:
            row = db.execute("SELECT data FROM lookup_cache WHERE key=? AND created_at>?",
                             (key, self.clock() - 30 * 86400)).fetchone()
            return json.loads(row[0]) if row else None

    def cache(self, key, result):
        with self.connection(write=True) as db:
            db.execute("INSERT OR REPLACE INTO lookup_cache VALUES (?, ?, ?)",
                       (key, _json(result), self.clock()))
            db.execute("DELETE FROM lookup_cache WHERE created_at<?", (self.clock() - 30 * 86400,))

    def export(self):
        with self.connection() as db:
            db.execute("BEGIN")  # Consistent snapshot across every table, even during reviews.
            # The table names are the literal tuple below, not caller input.
            return {"format": "phase-vocabulary", "version": 1, "exported_at": self.clock(),
                    "tables": {table: [dict(row) for row in db.execute(f"SELECT * FROM {table}")]  # nosec B608
                               for table in ("words", "cards", "events", "usages", "encounters")}}
