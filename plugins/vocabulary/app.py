"""Independent vocabulary API. Run with scripts/run-vocabulary.sh."""
from contextlib import asynccontextmanager
from typing import Literal
from urllib.parse import urlsplit
from uuid import UUID

from fastapi import FastAPI, Query, Request
from fastapi.responses import JSONResponse

from .config import VocabularySettings
from .lookup import LocalLookup
from .models import ImportInput, LookupInput, ReviewInput, UsageInput, WordEdit, WordInput
from .store import StoreError, VocabularyStore


def create_app(settings=None, store=None, lookup=None):
    settings = settings or VocabularySettings()

    @asynccontextmanager
    async def lifespan(app):
        app.state.store = store or VocabularyStore(settings.db_path, settings.timezone)
        app.state.lookup = lookup or LocalLookup(settings, app.state.store)
        yield

    app = FastAPI(title="Phase Vocabulary", version="1.0.0", lifespan=lifespan)

    @app.middleware("http")
    async def local_origin(request: Request, call_next):
        # No permissive CORS; prevents a random website writing a local library.
        origin = request.headers.get("origin")
        if origin and urlsplit(origin).netloc != request.headers.get("host"):
            return JSONResponse({"detail": "Use the Phase vocabulary adapter"}, status_code=403)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.exception_handler(StoreError)
    async def store_error(request, exc):
        return JSONResponse({"detail": str(exc)}, status_code=exc.status)

    @app.get("/health")
    def health():
        return {"service": "phase-vocabulary", "version": "1.0.0", "status": "ok",
                "storage": "sqlite", "inference": "local-ollama", "model": settings.model}

    @app.get("/v1/overview")
    def overview():
        return app.state.store.overview()

    @app.get("/v1/words")
    def words(q: str = Query(default="", max_length=120),
              status: Literal["active", "archived", "inbox", "all"] = "active",
              limit: int = Query(default=100, ge=1, le=200), offset: int = Query(default=0, ge=0)):
        return app.state.store.words(q, status, limit, offset)

    @app.post("/v1/words")
    def save(entry: WordInput):
        return app.state.store.save(entry)

    @app.get("/v1/words/{word_id}")
    def word(word_id: UUID):
        return app.state.store.get(str(word_id))

    @app.put("/v1/words/{word_id}")
    def edit(word_id: UUID, entry: WordEdit):
        return app.state.store.edit(str(word_id), entry)

    @app.get("/v1/due")
    def due(mode: Literal["recognition", "production"] = "production",
            limit: int = Query(default=20, ge=1, le=100)):
        return app.state.store.due(mode, limit)

    @app.post("/v1/reviews")
    def review(entry: ReviewInput):
        return app.state.store.review(entry)

    @app.post("/v1/usages")
    def usage(entry: UsageInput):
        return app.state.store.usage(entry)

    @app.post("/v1/lookup")
    async def lookup_word(entry: LookupInput):
        return await app.state.lookup.lookup(entry)

    @app.post("/v1/import")
    def import_words(entry: ImportInput):
        return app.state.store.import_entries(entry.entries)

    @app.get("/v1/export")
    def export():
        return JSONResponse(app.state.store.export(), headers={
            "Content-Disposition": 'attachment; filename="phase-vocabulary.json"'
        })

    return app


app = create_app()
