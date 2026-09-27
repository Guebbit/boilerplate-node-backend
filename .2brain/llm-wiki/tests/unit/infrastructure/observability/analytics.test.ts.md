---
source: tests/unit/infrastructure/observability/analytics.test.ts
sha256: 645a235860af06d401652ad022e402245dc703f697ff60ff61f15ed81aa2e553
generated_at: 2026-09-27T16:08:36.549071+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/observability/analytics.test.ts

## Purpose

Unit tests for the analytics observability module (`src/infrastructure/observability/analytics/index.ts`), covering provider selection, the Umami provider's wire-level behavior, and the PostHog provider. Because the emit contract is fire-and-forget by design, every assertion targets the outgoing HTTP payload or headers rather than any return value—the wire payload is the only observable a provider exposes.

## Key elements

- **`resolveAnalyticsProvider` / `resetAnalyticsProvider`** — tested for defaulting to `umami`, honoring `NODE_ANALYTICS_PROVIDER`, memoizing across calls, re-reading env after reset, and rejecting unknown names.
- **Umami provider tests** — verify the `fetch` URL, required `User-Agent` header (Umami silently drops events lacking one), optional `X-Forwarded-For` forwarding, `user_id` / `trace_id` placement in `payload.data`, property-merge safety (caller cannot overwrite `user_id`), trailing-slash tolerance, and request abort timeout.
- **`configureUmami` / `configurePostHog` / `clearAnalyticsEnvironment`** — env-var helpers that set or clear the provider configuration; `clearAnalyticsEnvironment` sets `NODE_ANALYTICS_REQUIRE_CONSENT='false'` so tests exercise provider behavior, not the consent gate.
- **`settle`** — returns a `setImmediate`-based promise to let the fire-and-forget `fetch` chain resolve before assertions run.
- **`sentRequest`** — decodes the first mocked `fetch` call into `{ url, headers, body }` for assertions.
- **PostHog mock** — `jest.mock('posthog-node')` replaces the SDK with a stub exposing `capture` and `shutdown` spies.
- **Real event constants** — imports `accountAnalyticsEvents`, `productsAnalyticsEvents`, `cartAnalyticsEvents`, `ordersAnalyticsEvents` so the emitted event names are ones the app actually uses.

## Relationships

- **`src/infrastructure/observability/analytics/index.ts`** — the module under test; the file imports its public API (`resolveAnalyticsProvider`, `emitAnalyticsEvent`, `resetAnalyticsProvider`, `buildAnalyticsBase`, `shutdownAnalytics`, types).
- **`src/modules/account/analytics.ts`**, **`src/modules/cart/analytics.ts`**, **`src/modules/orders/analytics.ts`**, **`src/modules/products/analytics.ts`** — each contributes one or more named event constants used as the `event` field in test inputs, keeping the wire assertions tied to real app vocabulary.
- **`tests/support/callers.ts`** — provides `callerAs` and `strangerCaller` helpers for constructing realistic caller contexts in test fixtures.

## Notes

- **Umami User-Agent requirement is non-obvious.** An event posted without a `User-Agent` header is discarded by Umami 2.14 and the response is still `200`. This behavior is invisible from the API and is pinned here by an explicit assertion that the header is always present.
- **`NODE_ANALYTICS_REQUIRE_CONSENT` is set to `'false'`, not deleted.** The real default is `true`; setting it to `false` intentionally bypasses the consent gate so tests isolate provider behavior.
- **`settle()` is required before asserting on `fetch` mock calls** because `emitAnalyticsEvent` is fire-and-forget: the `fetch` call is scheduled but not awaited within the function.
- **`X-Forwarded-For` is omitted entirely (not sent empty)** when no client IP is available, because an empty value would cause Umami to hash an empty string as a visitor address.
- **Provider selection is memoized.** Once resolved, changing `process.env` has no effect until `resetAnalyticsProvider()` is called—tests verify both the sticky behavior and the reset path.
