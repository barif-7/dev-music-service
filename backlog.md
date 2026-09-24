# Backlog

## September 23 follow-up — updated September 24, 2026

- Completed: SQLite translations are used by eager, background, and playback
  window paths, with restart and source/policy invalidation coverage.
- Completed: explicit local frontend origin default and stream-header coverage.
- Completed: the pending iPad wrapper now includes its missing Info.plist;
  simulator builds succeed. Verify playback, locked-device background audio,
  AirPlay, and tailnet connectivity on an iPad.
- Completed: recovered all 32 terminal comparison jobs in `mac-mini-ai-api`.
  DeepSeek accepted 8/8; Qwen 27B accepted 2/8 with six quota failures; Qwen Flash
  had eight quota failures; Kimi K3 had eight provider URL errors. See the
  [comparison report](https://github.com/barif-7/mac-mini-ai-api/blob/docs/qwen-benchmark-followup-20260924/benchmarks/reports/2026-09-23-model-comparison.md).
- Remaining: restore Qwen quota availability and diagnose Kimi K3 provider
  routing, then repeat identical benchmark runs before changing model policy.
  Provider failures do not measure coding quality. Keep free-tier restrictions.
- Remaining: transactional shared quota reservations, durable active coding
  jobs, cancellation, concurrency controls, and isolated execution before
  multi-node deployment. These were explicitly deferred in the September 23 task.
- Remaining: matched direct-build and orchestrator-token accounting before
  claiming total token/cost savings.
- Remaining: translation cache retention/size policy, quality metadata, and a
  resumable background translation worker. SQLite persists results today;
  background threads and queued-job records are not a durable execution system.

## Near-term
- Keep the runtime endpoint notes in sync with `main.py` and `services/ytdlp_service.py`.
- Record the audio playback behavior after each fix.
- Keep temporary media out of the source tree when possible.
- Verify stop/resume edge cases with a real track.
