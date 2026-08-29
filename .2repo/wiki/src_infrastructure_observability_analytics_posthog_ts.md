# src/infrastructure/observability/analytics/posthog.ts

## Purpose

Implements the `posthog` variant of the `AnalyticsProvider` interface. It exists as an alternative to the default Umami provider for projects that need identity-shaped funnels (stitching a user's timeline by `distinct_id`). Selected via `NODE_ANALYTICS_PROVIDER=posthog`; requires both `NODE_POSTHOG_API_KEY` and `NODE_POSTHOG_HOST` to be set.

## Key elements

- **`isPostHogConfigured()`** – Exports a pure check: both env vars must be truthy.
- **`_client`** (module-private, underscore-prefixed) – Lazily instantiated shared `PostHog` (from `posthog-node`) instance.
- **`getClient()`** – Creates `_client` on first call using the API key and host from env; configures batch flush (`flushAt: 20`, `flushInterval: 10 000`).
- **`posthogAnalyticsProvider`** – The exported `AnalyticsProvider` object with:
  - `configured()` – delegates to `isPostHogConfigured()`.
  - `capture(event)` – Enqueues the event on the client (non-blocking). Spreads caller properties first so the appended `trace_id` cannot be clobbered. Conditionally includes `trace_id` only when present.
  - `shutdown()` – Clears `_client` synchronously (so a racing `capture()` gets a fresh client), then calls `shutdown()` on the previous instance to flush and await the in-flight HTTP request.
- **`warnedAboutConfiguration`** – Module-private flag ensuring the "misconfigured" log warning fires exactly once.

## Relationships

- **`src/infrastructure/observability/analytics/index.ts`** – This file imports the `AnalyticsEvent` and `AnalyticsProvider` types defined there, conforming to the shared provider contract.
- **`src/infrastructure/adapters/logger.ts`** – Imports the shared `logger` solely to emit the one-time misconfiguration warning inside `capture()`.

## Notes

- The host is deliberately explicit (not defaulted) so deploying to the wrong PostHog region is a visible config choice, not a silent fallback.
- `shutdown()` must be called on process exit; without it, up to 20 buffered events are lost per deploy.
- The non-null assertion on `NODE_POSTHOG_API_KEY` inside `getClient()` is safe only because the sole caller (`capture`) is guarded by `isPostHogConfigured()` first.
- `capture()` is fire-and-forget with respect to the caller: the actual HTTP send happens on the next batch flush.
