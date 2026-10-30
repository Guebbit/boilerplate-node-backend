---
source: src/infrastructure/observability/analytics/posthog.ts
sha256: e18d8b0c99502fbdc8c84656907b91229b3469e90daa0d951b350a0d8e0e3f0c
generated_at: 2026-10-29T02:08:26.905641+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/analytics/posthog.ts

## Purpose

PostHog implementation of the analytics provider port. It exists as the non-default analytics backend for identity-shaped funnels (PostHog stitches a user's timeline by `distinct_id`), selected via `NODE_ANALYTICS_PROVIDER=posthog`. The trade-off is a hosted dependency, which is why `umami` remains the default.

## Key elements

- **`posthogAnalyticsProvider`** (export) — the `AnalyticsProvider` object with `name`, `configured()`, `capture()`, `forget()`, and `shutdown()`. This is the only public export.
- **`getClient()`** (module-private) — lazily instantiates the shared `PostHog` client (`flushAt: 20`, `flushInterval: 10_000`). Guarded by `isPostHogConfigured()` upstream, so the non-null assertion on the API key is safe.
- **`isPostHogConfigured()`** — checks that both `NODE_POSTHOG_API_KEY` and `NODE_POSTHOG_HOST` are set.
- **`readErasureConfig()`** — reads the three separate erasure env vars (`NODE_POSTHOG_PERSONAL_API_KEY`, `NODE_POSTHOG_PROJECT_ID`, `NODE_POSTHOG_API_HOST`) needed for the management-API `forget()` call.
- **`capture(event)`** — enqueues a PostHog capture; merges `trace_id` into properties without allowing caller properties to overwrite it.
- **`forget(distinctId)`** — calls the PostHog `persons/bulk_delete` management endpoint with `delete_events: true`; throws on non-2xx or non-empty `deletion_errors`. Resolves silently (no-op) when erasure config is absent.
- **`shutdown()`** — flushes pending events (bounded to `SHUTDOWN_TIMEOUT_MS = 3000`) and clears the module-level client so a racing `capture()` builds a fresh instance.
- **`warnedAboutConfiguration`** (module-private flag) — ensures the "missing credentials" warning is logged at most once per process.

## Relationships

- **`src/infrastructure/observability/analytics/index.ts`** — source of the `AnalyticsProvider` and `AnalyticsEvent` type imports that this file implements and consumes.
- **`src/infrastructure/observability/config.ts`** — provides `analyticsConfig()`, the single accessor for all PostHog-related env vars used here.
- **`src/infrastructure/adapters/logger.ts`** — supplies the `logger` used for the one-time misconfiguration warning in `capture()`.

## Notes

- Two distinct credential sets are required: capture uses a `phc_` project key + ingestion host; erasure uses a personal API key (scope `person:write`) + a separate management `apiHost`. They are independent — capture works without erasure config and vice-versa.
- `shutdown()` clears `_client` **before** awaiting the flush, so a concurrent `capture()` call re-enters `getClient()` and creates a fresh client rather than enqueueing onto one mid-close.
- The 3 s shutdown timeout is intentionally well under the process's own shutdown deadline (and under PostHog's library default of 30 s) so that a forced exit still leaves time for any downstream trace flush.
- The `// Stryker disable all` / `// Stryker restore all` pair around the warn block is a mutation-testing suppression; the logger call is the only side effect in that branch.
