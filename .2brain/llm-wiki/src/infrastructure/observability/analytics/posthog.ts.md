---
source: src/infrastructure/observability/analytics/posthog.ts
sha256: aad2e98faec1f436e88525f47c0fbd97b9391fa10e1236426f4ab5dde584a43c
generated_at: 2026-11-14T18:10:58.407944+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/analytics/posthog.ts

## Purpose

PostHog implementation of the `AnalyticsProvider` port. It exists as an alternative to the default Umami provider, chosen when identity-shaped funnels are needed (PostHog stitches a user timeline by `distinct_id`). Activated via `NODE_ANALYTICS_PROVIDER=posthog`.

## Key elements

- **`posthogAnalyticsProvider`** (export) — The sole export. An object conforming to `AnalyticsProvider` with four methods:
  - `configured()` — Returns whether both `NODE_POSTHOG_API_KEY` and `NODE_POSTHOG_HOST` are set.
  - `capture(event)` — Enqueues an event locally (non-blocking). Spreads caller properties first, then appends `trace_id` if present, so it cannot be overwritten. Logs a one-time warning if called while unconfigured.
  - `forget(distinctId)` — Deletes the person and their events via PostHog's management API (`persons/bulk_delete`). No-op when the three erasure knobs (`NODE_POSTHOG_PERSONAL_API_KEY`, `NODE_POSTHOG_PROJECT_ID`, `NODE_POSTHOG_API_HOST`) are absent. Throws on non-2xx or non-empty `deletion_errors`. Idempotent (`persons_found: 0` resolves).
  - `shutdown()` — Flushes the buffered client within 3 s. Clears the module-level `_client` reference *before* awaiting the flush so a concurrent `capture()` creates a fresh client.
- **`_client`** (module-private) — Lazily-created singleton `PostHog` instance; never instantiated when credentials are missing.
- **`SHUTDOWN_TIMEOUT_MS`** (3000) — Upper bound on the final flush, kept well under the process shutdown deadline.
- **`FORGET_TIMEOUT_MS`** (10000) — `AbortSignal.timeout` ceiling for the erasure HTTP call.
- **`BulkDeleteResponse`** (interface) — Models the `persons/bulk_delete` JSON body (`persons_found`, `deletion_errors`).
- **`isPostHogConfigured` / `readErasureConfig`** (private helpers) — Gate capture and erasure respectively.

## Relationships

- **`src/infrastructure/observability/analytics/index.ts`** — Imports the `AnalyticsEvent` and `AnalyticsProvider` types; this file is the concrete implementation selected by the factory in that index.
- **`src/infrastructure/observability/config.ts`** — All environment-variable access (`NODE_POSTHOG_API_KEY`, `NODE_POSTHOG_HOST`, erasure knobs) goes through `analyticsConfig()`.
- **`src/infrastructure/adapters/logger.ts`** — Imports the shared `logger` instance and calls it once (a one-time `warn` when `capture` is invoked without credentials).

## Notes

- The ingestion host (`NODE_POSTHOG_HOST`) and the management-API host (`NODE_POSTHOG_API_HOST`) are **separate** env vars; they point to different PostHog endpoints. Mixing them up silently breaks erasure.
- The erasure API key must be a *personal* API key with `person:write` scope — it is **not** the `phc_`-prefixed project key used for ingestion.
- `flushAt: 20` / `flushInterval: 10 000` mean up to 20 events (or 10 s of activity) can be lost if `shutdown()` is skipped (e.g., a crash).
- The `// Stryker disable all` comments around the warning block suppress mutation testing on that branch (it is intentionally a log-only guard).
- `distinct_id` is the join key across the user's events; ensure callers supply a stable identifier.
