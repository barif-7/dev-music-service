# Phase Field discussion mind map

```mermaid
mindmap
  root((Phase Field app))
    Shader system
      Built-in shaders
        Work without the shader API
        Explain why visuals remained visible
      Shader API
        20-shader catalogue
        GLSL source delivery
        Worker on port 59724
      Open questions
        Shader quality controls
        Offline and caching behavior
    Hosting and connectivity
      FastAPI app
        Build and API share port 8000
        Same-origin API requests
      Tailscale Funnel
        Default URL now routes to port 8000
        Port 8443 also routes to port 8000
      Current result
        Build returns HTTP 200
        Shader catalogue returns HTTP 200
        Shader source returns HTTP 200
    Mobile experience
      Phone heating
        Continuous WebGL rendering
        Up to display refresh rate
        High device-pixel ratio
        Multiple live canvases in grid view
        Per-frame FFT and EQ work
      Potential improvements
        Mobile 30 FPS cap
        Lower render resolution
        Throttled grid previews
        Pause while hidden or idle
        Performance and quality toggle
    Audio
      Current playback
        YouTube best-audio source
        Usually lossy AAC or Opus
        Proxy preserves content and byte ranges
      Lossless support
        Requires a genuinely lossless source
        FLAC
        ALAC
        WAV
        Local library or authorized provider
      Needed work
        Library streaming endpoint
        Browser codec detection
        Lossy fallback
        Quality metadata and badge
        Authentication for Funnel access
      Chromecast output
        Native Web Sender button
        Default Media Receiver
        Funnel-hosted range stream
        Remote play pause seek and progress
        Resume locally after disconnect
    Apple Music
      MusicKit on the Web
        Catalog search
        Subscriber authorization
        Playback queue
      Offline library import
        Music or iTunes XML accepted directly
        Previous apple_music_import JSON still accepted
        Play counts skips loved and dates preserved
        Album preview matched through MusicBrainz
      Required configuration
        Media ID and MusicKit key
        ES256 developer token
        Origin restriction
      Current state
        UI and API integration implemented
        Offline import works without a developer token
        Live catalog waits for developer token
    Next questions
      Mobile optimization priorities
      Lossless library source
      Access control
      Deployment and service persistence
```

## Current decisions and findings

- The public build and shader API now share the default Funnel origin.
- Built-in shaders provide a graceful fallback when the shader API is unavailable.
- Mobile heat is most likely caused by continuous GPU rendering and per-frame analysis.
- Lossless playback is possible, but only with a genuinely lossless source.
- Apple Music offline XML/JSON import works without a token; live MusicKit playback still awaits an origin-bound developer token.
- The earlier fallback build was recovered from `origin/codex/apple-music-fallback-import` at `944ec6a` and merged selectively into the current panel.

This document is intended to evolve as the discussion continues.
