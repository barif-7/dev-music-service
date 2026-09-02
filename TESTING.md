# Testing Guide

This document describes how to run tests and contribute to the test suite.

## Quick Start

```bash
# Run all tests
./test.sh

# Or manually
source .venv/bin/activate
pytest tests/ -v
```

## Test Structure

```
tests/
├── conftest.py          # Pytest fixtures and configuration
├── test_main.py         # E2E tests for API endpoints
├── test_services.py     # Unit tests for service layer
└── test_rate_limiting.py # Rate limiting and validation tests
```

## Frontend design audit

`pytest` covers the frontend's *wiring* — that a surface is framed, registered
and served with the right headers. It deliberately does **not** assert CSS
values against the stylesheet: that broke on every intentional design change
while missing the bugs that mattered, because `inset:0` followed by `right:auto`
reads fine as text and renders a 300px-wide "full-viewport" panel.

How it actually renders is measured in a real browser:

```bash
npm run audit:design
```

It boots the app on a free port, opens the notes overlay, and asserts computed
style and measured geometry — the pane is inset rather than full-bleed, the
glass is thin enough to let the field through, the overlay takes no slot in the
dock row and survives a narrow-viewport evict, the surface adds no second
backdrop, and a `/component` embed sizes itself from the vault's reported height
while staying sandboxed.

Not wired into CI: it needs a browser and a booted app, and a flaky render
should not block a merge. Run it when the design changes.

- `DESIGN_AUDIT_URL` — audit an already-running app instead of booting one.
- `DESIGN_AUDIT_CHROMIUM` — path to a Chromium binary, if discovery fails.

It needs a Chromium that `playwright-core` can drive; `npx playwright install
chromium` provides one. The Component Vault checks skip cleanly when the vault
is not running.

## Running Tests

### All Tests
```bash
pytest tests/ -v
```

### Specific Test File
```bash
pytest tests/test_main.py -v
```

### Specific Test Class
```bash
pytest tests/test_main.py::TestHealthEndpoint -v
```

### Specific Test Function
```bash
pytest tests/test_main.py::TestHealthEndpoint::test_health_returns_ok -v
```

### With Coverage
```bash
pytest tests/ -v --cov=. --cov-report=html
# Open coverage report in browser
open htmlcov/index.html
```

### With Output Capture Disabled
```bash
pytest tests/ -v -s
```

### Run Only Fast Tests (Skip API Calls)
```bash
pytest tests/ -v -m "not skip"
```

## Test Categories

### Unit Tests (`test_services.py`)
- Test individual service methods
- Mock external dependencies
- Fast execution (< 10ms per test)

### Integration Tests (`test_main.py`)
- Test API endpoints end-to-end
- Use FastAPI TestClient
- May call external APIs (marked with `@pytest.mark.skip`)

### Rate Limiting Tests (`test_rate_limiting.py`)
- Test rate limiting behavior
- Input validation and sanitization
- Some tests skipped by default (require time delays)

## Fixtures

Common fixtures available in all tests:

- `client` - TestClient without rate limiting
- `client_with_rate_limiting` - TestClient with rate limiting enabled
- `mock_spotify_env` - Mocks Spotify environment variables
- `mock_vercel_env` - Mocks Vercel environment
- `sample_search_query` - Sample search query string
- `sample_youtube_url` - Sample YouTube URL
- `sample_playlist_data` - Sample playlist data

## Writing Tests

### Example Test
```python
def test_search_requires_query(client: TestClient):
    """Search should require query parameter."""
    response = client.get("/api/search")
    
    assert response.status_code == 422
```

### Testing with External APIs
For tests that require external API access (YouTube, MusicBrainz, Spotify):

```python
@pytest.mark.skip(reason="Requires actual YouTube API")
def test_search_returns_results(client: TestClient):
    """Search should return results for valid query."""
    response = client.get("/api/search", params={"query": "test", "limit": 1})
    
    assert response.status_code == 200
```

### Mocking External Services
```python
def test_spotify_with_mock(client: TestClient, mock_spotify_env):
    """Test Spotify integration with mocked service."""
    with patch('services.spotify_import_service.SpotifyImportService.start_auth') as mock_start:
        mock_start.return_value = MagicMock(status_code=307)
        
        response = client.get("/api/import/spotify/start")
        
        assert response.status_code == 307
```

## CI/CD

Tests run automatically on:
- Push to `main` branch
- Pull requests to `main`

CI runs:
- Tests on Python 3.12 and 3.13
- Linting with flake8
- Security scan with bandit
- Coverage upload to Codecov

## Coverage Goals

Current coverage: ~60%

Target coverage:
- Services: 80%
- API endpoints: 90%
- Overall: 70%

## Troubleshooting

### Import Errors
```bash
# Reinstall dependencies
pip install -e ".[dev]"
```

### Async Test Errors
```python
# Use @pytest.mark.asyncio for async tests
@pytest.mark.asyncio
async def test_async_function():
    result = await some_async_function()
    assert result is not None
```

### Rate Limiting Test Failures
Rate limiting tests are skipped by default. To run them:
```bash
pytest tests/test_rate_limiting.py -v -m skip
```

## Contributing Tests

1. Add tests in appropriate file
2. Use descriptive test names: `test_<feature>_<condition>_<expected>`
3. Add docstrings explaining what's being tested
4. Mark external API tests with `@pytest.mark.skip`
5. Use fixtures for common setup
6. Run `./test.sh` before committing
