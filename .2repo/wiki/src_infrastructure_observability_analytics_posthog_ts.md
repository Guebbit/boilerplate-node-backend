# src/infrastructure/observability/analytics/posthog.ts

## Purpose

PostHog analytics provider — an alternative to the default `umami` that supports identity-shaped funnels by stitching a user's timeline via `distinct_id`. It exists as an opt-in (selected with `NODE_ANALYTICS_PROVIDER=posthog`) because PostHog is a hosted dependency that Umami is not.

## Key elements

- **`isPostHogConfigured()`** — Returns `true` only when both `NODE_POSTHOG_API_KEY` and `NODE_POSTHOG_HOST` are set. Used as the guard before any event is captured.
- **`_client`** (module-private) — Lazily-created singleton `PostHog` (from `posthog-node`). Buffering: `flushAt: 20`, `flushInterval: 10_000`.
- **`getClient()`** — Creates `_client` on first call; safe to assume env vars are set because it is only reached past the `isPostHogConfigured()` guard.
- **`warnedAboutConfiguration`** (module-private) — Ensures the "provider selected but unconfigured" warning is logged at most once.
- **`posthogAnalyticsProvider`** — The exported `AnalyticsProvider` object implementing `configured()`, `capture()`, and `shutdown()`.
  - `capture()` enqueues locally (non-blocking); spreads caller `properties` first, then appends `trace_id` if present, so the trace id cannot be clobbered.
  - `shutdown()` clears `_client` *before* awaiting the flush, so a concurrent `capture()` creates a fresh client rather than enqueueing onto a closing one.

## Relationships

- **`src/infrastructure/observability/analytics/index.ts`** — This file imports the `AnalyticsEvent` and `AnalyticsProvider` types from that index and exports an object conforming to the `AnalyticsProvider` contract.
- **`src/infrastructure/adapters/logger.ts`** — Imported as `logger`; used for the one-time misconfiguration warning inside `capture()`.

## Notes

- Both `NODE_POSTHOG_API_KEY` *and* `NODE_POSTHOG_HOST` must be set; the host is explicit so data is not silently shipped to the wrong region (US vs. EU vs. self-hosted).
- Without calling `shutdown()`, up to 20 buffered events (or 10 s worth) are lost on every deploy.
- The API key is a write-only server key; it never appears in client-side code.
- The underscore-prefixed `_client` follows the project's convention for module-private mutable state.
