# tests/unit/infrastructure/observability/analytics.test.ts

## Purpose

Unit tests for the analytics provider port and its implementations (Umami, PostHog, none). Because the analytics contract is fire-and-forget by design—no return value, no acknowledgement—these tests assert on the **wire payload** (URL, headers, JSON body) rather than on a function result. They exist to pin down non-obvious provider behaviours (e.g. Umami's silent 200-OK discard of events missing a `User-Agent`) that are invisible from source code alone.

## Key elements

- **`resolveAnalyticsProvider` tests** — verify default-to-Umami, explicit selection via `NODE_ANALYTICS_PROVIDER`, memoisation (env cannot change mid-process), and re-read after `resetAnalyticsProvider()`.
- **Umami provider tests** — cover URL construction (ingest host, trailing-slash tolerance, fallback to public host), required `User-Agent` header, caller `userAgent` forwarding, `X-Forwarded-For` inclusion/omission, `distinctId` → `payload.data.user_id`, optional `trace_id`, caller properties (with `user_id` spoof-prevention), hostname port-stripping (including bracketed IPv6), and the missing-website-id warn-once path.
- **PostHog provider tests** — exercise the mocked `posthog-node` class to confirm `capture` and `shutdown` are invoked with the right arguments.
- **Helpers** — `configureUmami`, `configurePostHog`, `clearAnalyticsEnvironment` (sets `NODE_ANALYTICS_REQUIRE_CONSENT='false'` so the consent gate is bypassed), `settle()` (`setImmediate` tick to let the fire-and-forget `fetch` chain resolve), `sentRequest()` (decodes the single `globalThis.fetch` call).
- **Mocks** — `posthog-node` (class factory), `@infrastructure/adapters/logger` (warn/debug spied, info/error no-ops), `globalThis.fetch`.

## Relationships

- **`src/infrastructure/observability/analytics/index.ts`** — the module under test; imports `resolveAnalyticsProvider`, `resetAnalyticsProvider`, `emitAnalyticsEvent`, `buildAnalyticsBase`, `shutdownAnalytics`, and the `AnalyticsEvent` type.
- **`src/modules/account/analytics.ts`**, **`src/modules/products/analytics.ts`**, **`src/modules/cart/analytics.ts`**, **`src/modules/orders/analytics.ts`** — supply real event-name constants (e.g. `productsAnalyticsEvents.PRODUCT_VIEWED`, `cartAnalyticsEvents.CART_ITEM_ADDED`) so tests exercise events the app actually emits rather than ad-hoc strings.
- **`tests/cross-cutting/contract-search-parity.test.ts`** — sibling test that verifies analytics event names stay consistent across search-related code paths; complementary to this file's per-provider wire-payload checks.

## Notes

- **Umami `User-Agent` gotcha:** Umami 2.14 silently discards events without a `User-Agent` header while still returning `200`. This is pinned as a test case because it is undiscoverable from Umami's API docs.
- **Fire-and-forget timing:** `capture()` returns before the HTTP request completes. The `settle()` helper (`setImmediate`) must be awaited before asserting on `fetch` calls; same-tick assertions will race the provider's own `.then`.
- **Memoisation:** `resolveAnalyticsProvider` caches the provider for the process lifetime. Tests that need a different provider must call `resetAnalyticsProvider()` first (done in `beforeEach`).
- **`clearAnalyticsEnvironment` sets, not deletes, `NODE_ANALYTICS_REQUIRE_CONSENT`:** the real default is `true`; setting it to `'false'` explicitly bypasses the consent gate so tests focus on provider behaviour rather than the gate.
- **Hostname handling:** ports are stripped from `payload.hostname` (Umami rejects `localhost:3000` with 400), but bracketed IPv6 addresses are preserved. These are edge cases that only surface in integration with a real Umami instance.
- **`user_id` spoof-prevention:** caller-supplied `properties.user_id` is overwritten by the resolved `distinctId`; the test asserts this explicitly.
