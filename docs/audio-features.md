# Audio Features

The Focus filter scores tracks on tempo / energy / valence / instrumentalness.
Those per-track **audio features** used to come from Spotify's `GET
/audio-features`, which Spotify **deprecated on 2024-11-27** and now returns
`403` for new apps. The feature is now sourced from **ReccoBeats**.

## Architecture

`FocusService` depends only on a provider interface, never on a concrete
source, so the source is swappable (and a hybrid is cheap to add later):

```python
# services/audio_feature_provider.py
class AudioFeatureProvider(Protocol):
    async def get_features(self, spotify_track_id: str) -> AudioFeatures | None: ...
    async def get_features_bulk(self, spotify_track_ids: list[str]) -> dict[str, AudioFeatures]: ...
```

- `None` / a missing key = **no data for that track** (honest absence).
- Transport/network failures **raise** — they are not turned into `None`.
- Track *lists* still come from Spotify (playlists, top tracks). Only the
  audio-feature lookup moved off Spotify.

`FocusService` resolves a provider via `_resolve_provider()` (defaults to the
module-level ReccoBeats singleton, injectable for tests/fallbacks). Scoring
(`focus_score()`, `matches_profile()`) and `focus_profile.json` are unchanged.

## ReccoBeats provider

`services/reccobeats_service.py`. Base URL `https://api.reccobeats.com/v1`
(override with `RECCOBEATS_API_BASE_URL`). **No API key** — the API is keyless.

ReccoBeats' audio-features endpoint is keyed by a **ReccoBeats UUID, not a
Spotify ID**, so each lookup is a two-step flow:

1. **Resolve** — `GET /v1/track?ids=<spotify ids>` (comma-separated, chunked at
   40). This batch endpoint accepts Spotify IDs and returns track objects. Each
   object carries its ReccoBeats `id` and an `href`
   (`https://open.spotify.com/track/<spotify_id>`). Results are re-associated to
   the Spotify ID **by parsing `href`, never by response order**. A Spotify ID
   absent from the response = no data.
2. **Fetch** — `GET /v1/track/{reccobeatsId}/audio-features` per resolved track,
   with bounded concurrency (`asyncio.Semaphore(5)`). `404` = no data.

### Field mapping

ReccoBeats returns the same field names and ranges Spotify did, so the mapping
is 1:1 and **no normalization is needed**:

| Field | Range | Used by scoring |
|-------|-------|-----------------|
| `tempo` | BPM (raw) | ✓ (bpm match) |
| `energy` | 0–1 | ✓ |
| `valence` | 0–1 | ✓ |
| `instrumentalness` | 0–1 (may be sci-notation, e.g. `9.54e-5`) | ✓ |
| `speechiness` | 0–1 | ✓ (penalty) |
| `liveness` | 0–1 | ✓ (penalty) |
| `acousticness`, `danceability` | 0–1 | surfaced |
| `loudness` | dB (negative) | surfaced |

The provider rewrites the record's identity to the Spotify ID and tags
`source: "reccobeats"`; `key`/`mode` are ignored.

### Cache

In-process `TTLCache` keyed by **Spotify track ID**, TTL **24h** (features are
immutable per track). Caches **negative results** too — a track ReccoBeats has
no data for is cached as `None`, so known-missing IDs are not re-fetched. The
cached `AudioFeatures.source` records which provider produced each record, so a
low-quality record can be re-analysed later. The persistent `httpx` client is
warmed in `main.lifespan()` and closed on shutdown.

### Rate limits

ReccoBeats' limits are undisclosed; on `429` it returns a `Retry-After` header.
The provider honors it (capped exponential backoff, 3 retries) and bounds
concurrency. See <https://reccobeats.com/docs/documentation/rate-limiting>.

### Coverage

ReccoBeats coverage is good but **not 100%**. Missing tracks are surfaced
honestly: the focus responses include `features_covered` / `features_total` and
a `no_data_tracks` list (`has_features: false`), and the UI shows
"Audio features for N of M tracks" with a distinct "no audio data" chip —
**never** a fabricated zero-score row.

## Hybrid migration plan (ReccoBeats + Essentia) — not yet built

The interface is designed so a second provider can be added as a **fallback for
tracks ReccoBeats has no data for**, closing the coverage gap and removing the
single-third-party dependency.

- Add an `EssentiaProvider` implementing `AudioFeatureProvider`, performing
  on-demand analysis of the audio stream the app already fetches via `yt-dlp`
  (or ReccoBeats' own file-upload extraction endpoint, `POST
  /v1/analysis/audio-features` — decided later; the interface makes either
  viable). It emits `AudioFeatures` with `source="essentia"`.
- Compose providers behind a small `HybridProvider(primary=reccobeats,
  fallback=essentia)`: try ReccoBeats first, fall back per-track on `None`.
  `FocusService` and the routes do not change — only `get_audio_feature_provider()`
  returns the composed provider.
- The cache is already provider-agnostic, keyed by stable track identity, with a
  `source` tag per record — so Essentia results cache identically and a
  ReccoBeats "no data" negative entry can be superseded by an Essentia result.
- Do **not** add Essentia/TensorFlow or other heavy audio deps until that work
  is scheduled.
