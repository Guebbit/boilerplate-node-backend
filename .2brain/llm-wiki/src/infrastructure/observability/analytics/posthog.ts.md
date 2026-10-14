---
source: src/infrastructure/observability/analytics/posthog.ts
sha256: eda1dad8d57c6be647d31d459eaffcf99e58fedea0bd331d9a275ef1a458c408
generated_at: 2026-10-14T08:04:37.376609+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/analytics/posthog.ts

## Purpose

Implements the PostHog adapter for the analytics port. Selected via `NODE_ANALYTICS_PROVIDER=posthog` as an alternative to the default Umami provider, chosen specifically for identity-shaped funnels because PostHog stitches a user's timeline by `distinct_id` — a capability Umami lacks. The trade-off is a hosted (or self-hosted) external dependency.

## Key elements

- **`isPostHogConfigured()`** — returns `true` only when both `NODE_POSTHOG_API_KEY` and `NODE_POSTHOG_HOST` are set. Used as a gate before any client work.
- **`_client`** — module-private, lazily instantiated `PostHog` Node client. Batching config: `flushAt: 20`, `flushInterval: 10 000` ms.
- **`getClient()`** — creates (or returns) the shared client. Safe to assert the API key is non-null because it is only reached past the `isPostHogConfigured()` guard.
- **`posthogAnalyticsProvider`** (exported) — the `AnalyticsProvider` object:
  - `configured()` — delegates to `isPostHogConfigured()`.
  - `capture(event)` — enqueues the event locally (non-blocking). Spreads `event.properties` first, then appends `trace_id` if present, so caller data cannot overwrite it.
  - `shutdown()` — flushes pending events with a 3 s cap, then clears `_client` so a racing `capture()` builds a fresh client rather than writing to a closing one.
- **`SHUTDOWN_TIMEOUT_MS`** (3000) — deliberately shorter than the library's 30 s default to stay within the process shutdown deadline.

## Relationships

- **`src/infrastructure/observability/analytics/index.ts`** — this file *implements* the `AnalyticsProvider` port and the `AnalyticsEvent` type defined there. It is the concrete adapter; `index.ts` is the contract.
- **`src/infrastructure/observability/config.ts`** — supplies `analyticsConfig()`, the single source for `NODE_POSTHOG_API_KEY`, `NODE_POSTHOG_HOST`, and the provider selector.
- **`src/infrastructure/adapters/logger.ts`** — provides `logger.warn` for the one-time misconfiguration warning (emitted only once per process lifetime via the `warnedAboutConfiguration` flag).

## Notes

- **Host is required, not optional.** PostHog defaults its host to the US cloud; the code rejects a missing `NODE_POSTHOG_HOST` to prevent silently shipping product data to the wrong region.
- **Buffering means events are lost on crash/deploy unless `shutdown()` is called.** Up to 20 events (or 10 s of traffic) sit in memory before the first flush.
- **`_client` is cleared *before* `shutdown()` resolves.** A `capture()` that races the shutdown will see `_client === undefined`, call `getClient()`, and build a brand-new client — it will not enqueue onto the one being torn down.
- **Stryker mutation-testing** annotations wrap the warn block so dead-code mutations on the warning path are not flagged.
- The underscore prefix on `_client` is the project convention for module-private mutable state.
