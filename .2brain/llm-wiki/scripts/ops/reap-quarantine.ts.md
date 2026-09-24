---
source: scripts/ops/reap-quarantine.ts
sha256: 8aeb26f3b60ae860f5a9c919cc8b2fd5c6f174e12adf921ccd46bf44c183b41c
generated_at: 2026-09-23T17:30:19.892741+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/reap-quarantine.ts

## Purpose

A standalone, idempotent cleanup script that deletes quarantined upload files older than a configurable retention window (default 24 h). It exists as a backstop: quarantine files should normally be removed by the pipeline itself, but crashes, lost deliveries, or unregistered-collection payloads can leave orphans behind. Intended to run as a periodic job (cron / scheduled container task), not by hand.

## Key elements

- **`retentionMs()`** — Reads `NODE_QUARANTINE_RETENTION_HOURS` (via `environmentNumber`, min 1) and returns the threshold in milliseconds. Defaults to 24 h.
- **`main()`** — Resolves the quarantine directory via `quarantineRoot()`, calls `reapDirectory()` with the cutoff timestamp, then logs the `{ checked, reaped }` result.
- **`runScript(main, …)`** — Wraps `main` in the project's standard script-lifecycle harness. The second argument is a no-op cleanup callback (`Promise.resolve()`).

## Relationships

- **`scripts/db/run-script.ts`** — Provides `runScript`, the shared entry-point wrapper that handles setup/teardown around the `main` callback.
- **`src/infrastructure/adapters/filesystem.ts`** — Provides `reapDirectory`, which performs the actual age-based file deletion and returns `{ checked, reaped }` counts.
- **`src/infrastructure/adapters/image-store.ts`** — Provides `quarantineRoot()`, the canonical path to the quarantine directory (tied to `NODE_QUARANTINE_PATH`).
- **`src/infrastructure/adapters/logger.ts`** — Provides the structured `logger` used to emit the final "Quarantine reaped." info line.
- **`src/infrastructure/runtime/environment.ts`** — Provides `environmentNumber`, the typed env-var reader used for the retention-hours setting.

## Notes

- The script is filesystem-only; it does **not** touch the database despite living under `scripts/ops/` and importing from `scripts/db/`. The `runScript` import is purely for its lifecycle wrapper.
- `NODE_QUARANTINE_PATH` is never served to clients and is only read by the digest pipeline, so reaping it is safe under concurrent traffic.
- The retention default (24 h) is deliberately generous to avoid deleting files during a short broker outage or maintenance window.
- Reference doc: `docs/tools/image-processing.md`.
