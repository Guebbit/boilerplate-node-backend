---
source: src/infrastructure/observability/analytics/posthog.ts
sha256: b05806f66eaa561370e5b994f777a335943e0f3cd535ba5c25ec87f2a72d7cb1
generated_at: 2026-09-27T14:12:30.567237+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/analytics/posthog.ts

## Purpose

Implements the `AnalyticsProvider` port (defined in `./index`) using the PostHog Node client. It exists as an opt-in alternative to the default Umami provider, chosen specifically when identity-shaped funnels are needed (PostHog stitches a user's timeline by `distinct_id`). Selected via `NODE_ANALYTICS_PROVIDER=posthog`.

## Key elements

- **`isPostHogConfigured()`** — Returns `true` only when both `NODE_POSTHOG_API_KEY` and `NODE_POSTHOG_HOST` are set. Acts as the gate before any client work.
- **`_client`** (module-private) — Lazily-instantiated `PostHog` instance, shared across all calls. Cleared on shutdown to prevent enqueueing onto a closing client.
- **`getClient()`** — Creates the client on first use with `flushAt: 20` and `flushInterval: 10 000` ms. Only reachable after the `isPostHogConfigured()` guard.
- **`posthogAnalyticsProvider`** — The exported `AnalyticsProvider` object with `name`, `configured()`, `capture()`, and `shutdown()`.
  - `capture()` enqueues an event locally (non-blocking); spreads `event.properties` first so the injected `trace_id` key cannot be overridden.
  - `shutdown()` flushes pending events with a 3 s timeout (`SHUTDOWN_TIMEOUT_MS`), then resolves.
- **`warnedAboutConfiguration`** — Module-level flag ensuring the "unconfigured" warning is logged at most once per process.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — Imports `logger` solely for the one-time `logger.warn()` emitted when the provider is selected but credentials are missing.
- **`src/infrastructure/observability/analytics/index.ts`** — Imports the `AnalyticsEvent` and `AnalyticsProvider` types; this file is the concrete implementation that the index re-exports / dispatches to.

## Notes

- The host is deliberately required (no default) to prevent silently shipping product data to the wrong region (EU vs US vs self-hosted).
- `capture()` is fire-and-forget at the call-site; events are buffered in memory and flushed in batches. A missing `shutdown()` call (e.g., a crash) loses up to 20 events or ~10 s of data.
- During shutdown, `_client` is set to `undefined` *before* the flush promise resolves, so a concurrent `capture()` builds a fresh client rather than writing to one that is closing.
- The 3 s shutdown timeout is intentionally below the library's 30 s default and below the process's own shutdown deadline, so the trace-flush step that runs afterwards is not skipped.
- `// Stryker disable all` / `restore` comments around the warn block suppress mutation-testing on that dead-branch (the `if` is structurally guaranteed true on the first miss).
