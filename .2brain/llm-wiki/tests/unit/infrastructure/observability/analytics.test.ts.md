---
source: tests/unit/infrastructure/observability/analytics.test.ts
sha256: cc76363dbeb554c70a027e889b6c06125147aac11d1ccc6c5debab5d365db131
generated_at: 2026-11-08T10:20:20.069613+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/observability/analytics.test.ts

## Purpose

Unit tests for the analytics provider port and its implementations (Umami, PostHog). Because the emit contract is fire-and-forget—no return value is observable—every assertion targets the wire payload (URL, headers, JSON body) rather than a resolved value. The file also pins a live-observed Umami behaviour (silent 200 on missing `User-Agent`) that is invisible from the API spec.

## Key elements

- **`resolveAnalyticsProvider` / `resetAnalyticsProvider`** — tested for default selection (Umami), explicit selection via `NODE_ANALYTICS_PROVIDER`, memoisation, reset-then-re-read, and rejection of unknown names.
- **`emitAnalyticsEvent` (Umami path)** — asserts correct ingest URL (including trailing-slash tolerance and public-host fallback), required `User-Agent` header, caller `User-Agent` / `X-Forwarded-For` forwarding, omission of `X-Forwarded-For` when absent, exclusion of account IDs, trace-id inclusion/exclusion, property-collision safety, and `AbortSignal` bounding.
- **`emitAnalyticsEvent` (PostHog path)** — exercised through a mocked `posthog-node` class; asserts `capture` is called with the expected distinct id, event name, and properties.
- **`buildAnalyticsBase` / `shutdownAnalytics`** — exercised indirectly through the provider lifecycle and the PostHog `shutdown` mock.
- **`clearAnalyticsEnvironment`** — resets all `NODE_ANALYTICS_*` / `NODE_UMAMI_*` / `NODE_POSTHOG_*` vars and explicitly sets `NODE_ANALYTICS_REQUIRE_CONSENT` to `'false'` so the consent gate does not interfere with provider-behaviour assertions.
- **`settle` / `sentRequest`** — microtask-queue drain helper and decoded-fetch-calls accessor.
- **Mocks** — `posthog-node` (class factory), `@infrastructure/adapters/logger`, and global `fetch`.

## Relationships

- **`src/infrastructure/observability/analytics/index.ts`** — the module under test; all public exports are imported and asserted against.
- **`src/modules/account/analytics.ts`**, **`src/modules/cart/analytics.ts`**, **`src/modules/orders/analytics.ts`**, **`src/modules/products/analytics.ts`** — supply real event-constant objects (`accountAnalyticsEvents`, `cartAnalyticsEvents`, etc.) so the payloads under test are shaped exactly as the app emits them.
- **`tests/support/callers.ts`** — provides `callerAs` and `strangerCaller` helpers (imported but not visible in the truncated portion; likely used in consent-gate or identity-related cases).
- **`tests/support/environment.ts`** — `setEnvironment` is the sole mechanism for mutating `NODE_*` configuration between cases.
- **`tests/cross-cutting/contract-search-parity.test.ts`** — shares the analytics infrastructure dependency graph; no direct import in this file.

## Notes

- The consent gate (`NODE_ANALYTICS_REQUIRE_CONSENT`) is deliberately bypassed in almost all cases by setting it to `'false'`; only a dedicated `describe` block (not visible in the truncated portion) exercises the gate itself.
- `clearAnalyticsEnvironment` *sets* consent to the string `'false'` rather than deleting it, because the production default is `true`.
- Provider resolution is memoised for the process lifetime; `resetAnalyticsProvider()` is the only way to force a re-read of the environment.
- The Umami `User-Agent` test exists because Umami 2.14 silently drops events lacking the header while still responding `200`—a behaviour not derivable from documentation.
- `fetch` is globally mocked and inspected via `mock.calls`; the `sentRequest` helper assumes exactly one call per emit.
- Real event constants (not inline strings) are used so that a rename in a module's analytics file breaks these tests, keeping the wire contract in sync.
