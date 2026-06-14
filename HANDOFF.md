# Handoff Notes

Running context for whoever picks this up next. Newest first.

## Packaging

- **`pyproject.toml` is the source of truth for dependencies**, not
  `requirements.txt`. Use `uv` (`uv run …`, `uv run --extra dev pytest`).
- Dev tooling (pytest, flake8, bandit) lives in the `dev` optional-dependency
  group.

## 2026-06-14 — Audio features moved from Spotify to ReccoBeats

**Why:** Spotify deprecated `GET /audio-features` on 2024-11-27 and now returns
`403` for this app, which made the entire Focus filter (BPM / energy / focus
scoring) non-functional.

**What changed:**

- New provider abstraction `services/audio_feature_provider.py`
  (`AudioFeatureProvider` Protocol). `FocusService` depends only on it, so the
  source is swappable.
- New `services/reccobeats_service.py` (`ReccoBeatsProvider`). Keyless API at
  `https://api.reccobeats.com/v1`. Two-step lookup (resolve Spotify IDs →
  ReccoBeats track objects, then fetch features per ReccoBeats UUID) because the
  features endpoint is **not** keyed by Spotify ID. Bounded concurrency,
  `429`/`Retry-After` backoff, 24h TTL cache including negative results.
- `FocusService` reworked to use the provider; surfaces **coverage**
  (`features_covered`/`features_total`) and **`no_data_tracks`** instead of
  dropping tracks or faking zero scores. `focus_score()`, `matches_profile()`,
  and `focus_profile.json` are unchanged (ReccoBeats ranges match Spotify's).
- `AudioFeatures` gained a `source` tag (`"reccobeats"` today). `/api/focus/*`
  HTTP signatures unchanged; responses gained additive coverage/no-data fields.
- Frontend focus panel shows coverage and a distinct "no audio data" state.
- Full design + the planned ReccoBeats + Essentia hybrid in
  [`docs/audio-features.md`](docs/audio-features.md).

**No remaining runtime dependency on Spotify's `/audio-features`.** Spotify is
still used only for track *lists* (playlists, top tracks) and OAuth.

**Config:** `RECCOBEATS_API_BASE_URL` (default
`https://api.reccobeats.com/v1`). No API key required.

### Known pre-existing test issue (unrelated to this change)

`tests/test_main.py::test_search_accepts_album_and_year_hints` fails on `main`
too: it asserts `MusicService.search` is called with `expected_album`/
`expected_year` as **kwargs**, but the `/api/search` route passes them
positionally. Either the route or the test should be reconciled — out of scope
for the ReccoBeats work.
