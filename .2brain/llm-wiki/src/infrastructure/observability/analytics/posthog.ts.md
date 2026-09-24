---
source: src/infrastructure/observability/analytics/posthog.ts
sha256: eea5c68045b58f52d5f80c81660413a95bb4693bdea4bdbbb2394c0b05576550
generated_at: 2026-09-23T17:48:02.616799+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/analytics/posthog.ts

## Purpose

PostHog analytics provider, selected via `NODE_ANALYTICS_PROVIDER=posthog`. Exists as an alternative to the default Umami provider for identity-shaped funnels: PostHog stitches a user's event timeline by `distinct_id`, which Umami cannot. The trade-off is a hosted dependency, so it is opt-in.

## Key elements

- **`isPostHogConfigured()`** — Returns `true` only when both `NODE_POSTHOG_API_KEY` and `NODE_POSTHOG_HOST` are set.
- **`_client`** — Module-private lazy singleton holding the `PostHog` (posthog-node) instance.
- **`getClient()`** — Creates the shared client on first call (buffering: `flushAt: 20`, `flushInterval: 10 000 ms`) and returns it.
- **`warnedAboutConfiguration`** — Boolean guard so the "missing credentials" warning fires at most once.
- **`posthogAnalyticsProvider`** — The exported object implementing the `AnalyticsProvider` contract from `./index`. Exposes `name`, `configured()`, `capture(event)`, and `shutdown()`.

## Relationships

- **`./index.ts`** — Imports the `AnalyticsEvent` and `AnalyticsProvider` types. This file is the PostHog *implementation* of that port; `index.ts` is the contract/registry.
- **`@infrastructure/adapters/logger`** — Imports `logger` solely for the one-time misconfiguration warning inside `capture()`.

## Notes

- `NODE_POSTHOG_HOST` has **no default**. It is deliberately explicit to prevent silently shipping product data to the wrong PostHog region (US vs EU vs self-hosted).
- `capture()` is non-blocking: events are enqueued in memory and flushed in batches. `shutdown()` must be called on process exit to flush pending events (up to 20 or 10 s worth).
- In `shutdown()`, `_client` is nulled **before** awaiting the flush, so a concurrent `capture()` call gets a fresh client rather than enqueuing onto a closing one.
- `trace_id` is spread *after* `event.properties` so caller-supplied properties cannot accidentally overwrite it.
- The `!` non-null assertion on `NODE_POSTHOG_API_KEY` inside `getClient()` is safe because `getClient()` is only reachable after the `isPostHogConfigured()` guard in `capture()` has passed.
- Stryker mutation-testing suppression (`// Stryker disable all`) wraps the warn block: the warning *is* the correct behavior, so mutations there are not meaningful failures.
