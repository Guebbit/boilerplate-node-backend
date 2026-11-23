---
source: src/infrastructure/observability/analytics/posthog.ts
source_sha256: 0a170696ed68a6940a9966ff2627643948ec19fb1ae000037600f23160342193
context_sha256: 8669642fc28e0e8d9d7aa1504ba888269f5441e3e601a3167f838f7b46412be5
generated_at: 2026-11-22T02:57:29.726320+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/observability/analytics/posthog.ts

## Purpose
PostHog implementation of the `AnalyticsProvider` port, an alternative to the default `umami` provider. It is meant for identity-shaped funnels, since PostHog stitches a user's timeline by `distinct_id`. It is selected with `NODE_ANALYTICS_PROVIDER=posthog` and needs `NODE_POSTHOG_API_KEY` and `NODE_POSTHOG_HOST`. It also supports per-person erasure and a bounded flush on shutdown.

## Key elements
- `posthogAnalyticsProvider` (the only export) is an `AnalyticsProvider` named `'posthog'` with four methods:
  - `configured()` returns true only when both the API key and the host are set.
  - `capture(event)` enqueues the event on the shared `posthog-node` client. It does not block. `event.properties` is spread first, then `trace_id` is added when `event.traceId` is set, so a caller cannot overwrite it. If the provider is not configured, it discards the event and logs one warning for the process lifetime.
  - `forget(distinctId)` calls PostHog's `persons/bulk_delete/` endpoint with `delete_events: true`. It uses a 10 s timeout (`FORGET_TIMEOUT_MS`) and sends a Bearer personal API key. It throws on a non-2xx response or a non-empty `deletion_errors`. If any erasure setting is missing, it resolves as a no-op.
  - `shutdown()` flushes and closes the client with a 3 s bound (`SHUTDOWN_TIMEOUT_MS`).
- `getClient()` lazily creates the `PostHog` client in the module-private `_client`, with `flushAt: 20` and `flushInterval: 10_000`.
- `isPostHogConfigured()` checks the key and the host.
- `readErasureConfig()` returns `{ apiKey, projectId, apiHost }`, or `undefined` if any of `NODE_POSTHOG_PERSONAL_API_KEY`, `NODE_POSTHOG_PROJECT_ID` or `NODE_POSTHOG_API_HOST` is unset.

## Relationships
- `./index` supplies the `AnalyticsProvider` and `AnalyticsEvent` types, which this file implements as the analytics port contract (type-only import).
- `@infrastructure/observability/config` supplies `analyticsConfig()`, which provides all the `NODE_POSTHOG_*` settings. It is read on each call rather than cached.
- `@infrastructure/adapters/logger` supplies `logger`, used for the one-time "events are being discarded" warning in `capture`.

## Notes
- There is no default host. This is deliberate, to avoid silently sending data to the wrong region (self-hosted, EU or US cloud).
- Erasure uses separate settings from capture: a personal API key with `person:write` scope, and an API host that can differ from the ingestion host. Without them, capture still works and only `forget` is skipped.
- `forget` is idempotent. `persons_found: 0` resolves normally, so a replayed erasure is harmless. The error-throwing design lets the caller (a relay, per the comments) retry.
- `shutdown()` clears `_client` before the flush finishes. A `capture()` that races with shutdown creates a fresh client instead of using the closing one.
- The 3 s shutdown timeout is deliberately shorter than the library default of 30 s. A longer flush could outlast the process's shutdown deadline and cause a forced exit that skips the trace flush that runs afterward.
- Without `shutdown()`, up to 20 buffered events (or 10 s of events) would be lost on each deploy.
- The non-null assertion on `NODE_POSTHOG_API_KEY` in `getClient()` is safe only because `capture` checks `isPostHogConfigured()` first.
- The warning block is wrapped in `// Stryker disable all` and `// Stryker restore all`, which exclude it from mutation testing.
