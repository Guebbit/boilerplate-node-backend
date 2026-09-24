---
source: tests/unit/infrastructure/observability/analytics.test.ts
sha256: 817e51caf62f5089006a7e1f12cbee1100c7dd768bcc2efe8193f09db104a24a
generated_at: 2026-09-23T20:24:42.612538+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/observability/analytics.test.ts

## Purpose

Unit tests for the analytics provider port (`src/infrastructure/observability/analytics/`) and its Umami and PostHog implementations. Because the emit contract is fire-and-forget (no return value), every assertion inspects the decoded wire payload (`fetch` call or PostHog `capture` argument) rather than a return value. The file also pins non-obvious external behaviors (e.g. Umami silently dropping events without a `User-Agent` header) that are invisible from the source code.

## Key elements

- **`resolveAnalyticsProvider` block** — verifies default-to-umami, explicit selection via `NODE_ANALYTICS_PROVIDER`, memoization across calls, reset behavior, and rejection of unknown provider names.
- **Umami provider block** — asserts POST URL construction (ingest host, trailing-slash tolerance, public-host fallback), body shape (`type`, `payload.website`, `payload.name`), mandatory `User-Agent` header, forwarding of caller `userAgent` / `clientIp` (`X-Forwarded-For`), omission of `X-Forwarded-For` when no IP, `user_id` / `trace_id` in `payload.data`, caller-property merging (and that it cannot overwrite `user_id`), and port stripping from `hostname`.
- **PostHog provider block** (truncated) — exercises `posthog-node` via a `jest.mock` of the `PostHog` class; asserts `capture` arguments and `shutdown` on `shutdownAnalytics`.
- **Helpers**
  - `configureUmami` / `configurePostHog` — set the env vars a provider needs to send.
  - `clearAnalyticsEnvironment` — removes all analytics env vars and pins `NODE_ANALYTICS_REQUIRE_CONSENT=false` so the consent gate does not short-circuit.
  - `settle` — one `setImmediate` tick so the fire-and-forget `fetch` chain resolves before assertions run.
  - `sentRequest` — decodes the single `globalThis.fetch` mock call into `{ url, headers, body }`.
  - `mockCapture`, `mockShutdown`, `mockedPostHog` — the PostHog spies reachable through Jest's module registry.

## Relationships

- **`src/infrastructure/observability/analytics/index.ts`** — the unit under test; the file imports `resolveAnalyticsProvider`, `resetAnalyticsProvider`, `emitAnalyticsEvent`, `buildAnalyticsBase`, `shutdownAnalytics`, and the `AnalyticsEvent` / `AnalyticsEventInput` types.
- **`src/modules/account/analytics.ts`**, **`src/modules/cart/analytics.ts`**, **`src/modules/orders/analytics.ts`**, **`src/modules/products/analytics.ts`** — supply real event-name constants (`accountAnalyticsEvents`, `cartAnalyticsEvents`, `ordersAnalyticsEvents`, `productsAnalyticsEvents`) so test fixtures exercise the same identifiers the controllers emit.
- **`tests/support/callers.ts`** — provides `callerAs` and `strangerCaller` helpers for constructing caller-context fixtures.
- **`tests/cross-cutting/contract-search-parity.test.ts`** — shares the analytics port contract; this file validates the provider side while the parity test validates the consumer side.

## Notes

- **Consent is disabled by default in this file.** `clearAnalyticsEnvironment` sets `NODE_ANALYTICS_REQUIRE_CONSENT=false` (not `delete`) because the real default is `true`, and the intent here is to test provider behavior *after* the gate, not the gate itself. Only a dedicated consent-gate `describe` block tests the gate.
- **Memoization is intentional.** `resolveAnalyticsProvider` caches on first call; tests must call `resetAnalyticsProvider()` (in `beforeEach`) before changing env vars, or the stale provider is returned.
- **`settle()` is required after `emitAnalyticsEvent`.** The Umami provider fires `fetch` without awaiting it; asserting on the same tick reads the mock before the `.then` has run.
- **Umami `User-Agent` requirement** is pinned as a test because it was discovered against a live Umami 2.14 instance and is not documented in Umami's API. The response is still `200` even when the event is discarded.
- **`hostname` port stripping** (`localhost:3000` → `localhost`) is asserted because Umami returns `400` on non-default-port hostnames; this is the entire local-dev case.
