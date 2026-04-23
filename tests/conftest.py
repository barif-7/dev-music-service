"""Pytest fixtures and configuration for E2E testing."""
import os
from typing import AsyncGenerator, Generator

import pytest
from fastapi.testclient import TestClient

from main import app, limiter


@pytest.fixture(scope="session")
def anyio_backend():
    """Configure anyio backend for async tests."""
    return "asyncio"


@pytest.fixture(scope="function")
def client() -> Generator[TestClient, None, None]:
    """
    Create a test client for the FastAPI app.
    
    This fixture creates a fresh client for each test function,
    ensuring test isolation.
    """
    # Disable rate limiting for tests
    app.state.limiter.enabled = False
    
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


@pytest.fixture(scope="function")
def client_with_rate_limiting() -> Generator[TestClient, None, None]:
    """
    Create a test client with rate limiting enabled.
    
    Use this fixture when testing rate limiting behavior.
    """
    app.state.limiter.enabled = True
    
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client
    
    # Reset after test
    app.state.limiter.enabled = False


@pytest.fixture
def mock_spotify_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Mock Spotify environment variables for testing."""
    monkeypatch.setenv("SPOTIFY_CLIENT_ID", "test_client_id_12345")
    monkeypatch.setenv("SPOTIFY_REDIRECT_URI", "http://testserver/callback")


@pytest.fixture
def mock_vercel_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Mock Vercel environment for testing."""
    monkeypatch.setenv("VERCEL", "true")


@pytest.fixture
def sample_search_query() -> str:
    """Sample search query for testing."""
    return "blinding lights the weeknd"


@pytest.fixture
def sample_youtube_url() -> str:
    """Sample YouTube URL for testing."""
    return "https://www.youtube.com/watch?v=4NRXx6U8ABQ"


@pytest.fixture
def sample_playlist_data() -> dict:
    """Sample playlist data for testing."""
    return {
        "id": "test_playlist_123",
        "name": "Test Playlist",
        "track_count": 10,
        "owner": "test_user",
    }
