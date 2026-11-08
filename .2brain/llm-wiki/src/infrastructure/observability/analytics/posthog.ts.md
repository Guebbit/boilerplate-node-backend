---
source: src/infrastructure/observability/analytics/posthog.ts
sha256: e18d8b0c99502fbdc8c84656907b91229b3469e90daa0d951b350a0d8e0e3f0c
generated_at: 2026-11-08T03:38:26.338768+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/analytics/posthog.ts

## Purpose

Implements the PostHog analytics provider as an alternative to the default Umami provider. PostHog is chosen for identity-shaped funnels because it stitches a user's event timeline by `distinct_id`, which Umami cannot do. The trade-off is a hosted dependency, so it is opt-in via `NODE_ANALYTICS_PROVIDER=posthog`.

## Key elements

- **`posthogAnalyticsProvider`** (export) — the `AnalyticsProvider` object with `name`, `configured()`, `capture()`, `forget()`, and `shutdown()`.
- **`getClient()`** — lazy singleton that instantiates the `posthog-node` client on first use (only reached after the configuration guard passes).
- **`isPostHogConfigured()`** — returns `true` when both `NODE_POSTHOG_API_KEY` and `NODE_POSTHOG_HOST` are set.
- **`readErasureConfig()`** — reads the three erasure-specific vars (`NODE_POSTHOG_PERSONAL_API_KEY`, `NODE_POSTHOG_PROJECT_ID`, `NODE_POSTHOG_API_HOST`); returns `undefined` if any are missing.
- **`SHUTDOWN_TIMEOUT_MS`** (3 000 ms) — bounds the final event flush during `shutdown()`.
- **`FORGET_TIMEOUT_MS`** (10 000 ms) — bounds the `persons/bulk_delete` HTTP call so a hung PostHog triggers a retry by the caller.
- **`BulkDeleteResponse`** — typed shape of the deletion API response (`persons_found`, `deletion_errors`).

## Relationships

- **`./index`** — imports the `AnalyticsEvent` and `AnalyticsProvider` types; this file exports the concrete PostHog implementation of that contract.
- **`@infrastructure/observability/config`** — imports `analyticsConfig` to read all PostHog environment variables at call time.
- **`@infrastructure/adapters/logger`** — imports `logger` to emit a single misconfiguration warning when `posthog` is selected but credentials are absent.

## Notes

- **Two credential sets.** Ingestion needs the project key + host; erasure needs a personal API key (`person:write` scope), a project ID, and a separate API host. `capture` works without the erasure trio; `forget` silently no-ops without them.
- **Property spread order.** In `capture()`, `event.properties` is spread first and `trace_id` second, so caller data cannot accidentally overwrite the trace correlation id.
- **Shutdown race.** `_client` is set to `undefined` *before* the flush promise resolves, ensuring a `capture()` call that arrives during shutdown creates a fresh client rather than enqueuing onto one that is closing.
- **Stryker annotations.** The one-time warning block is wrapped in `Stryker disable all` / `restore all` to suppress mutation-test noise on a log-only path.
