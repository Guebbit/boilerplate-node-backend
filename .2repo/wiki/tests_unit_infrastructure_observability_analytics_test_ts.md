# tests/unit/infrastructure/observability/analytics.test.ts

## Purpose

Unit tests for the analytics provider port and its Umami/PostHog implementations. Because the public contract is fire-and-forget (no return value to assert on), every test asserts on the outgoing wire payload — the decoded `fetch` call or the PostHog `capture` arguments — which is the only observable a provider produces. The file also pins behaviours discovered against a live Umami 2.14 instance that are invisible from its API (e.g. silent event discard without a `User-Agent` header).

## Key elements

- **`describe('resolveAnalyticsProvider')`** — Verifies provider selection by env var, the default (umami), memoisation, and re-reading after `resetAnalyticsProvider()`.
- **`describe('the umami provider')`** — The bulk of the file. Asserts on `globalThis.fetch` calls to validate URL, headers (`User-Agent`, `X-Forwarded-For`), and JSON body (website id, event name, `user_id`, `trace_id`, hostname port-stripping, IPv6 bracket handling). Also covers the "warn once, send nothing" path when `NODE_UMAMI_WEBSITE_ID` is missing.
- **`configureUmami` / `configurePostHog` / `clearAnalyticsEnvironment`** — Helpers that set or delete the relevant `NODE_*` env vars for each provider.
- **`settle()`** — Yields one `setImmediate` tick so the fire-and-forget `.then` chain resolves before assertions run.
- **`sentRequest()`** — Extracts and decodes the first `fetch` mock call into `{ url, headers, body }`.
- **`mockCapture` / `mockShutdown`** — Jest mocks backing the `posthog-node` factory; asserted on in the PostHog section (truncated in source).
- **Mocked logger** — `@infrastructure/adapters/logger` is replaced so `warn`/`debug` calls can be counted (e.g. "warns once" assertion).

## Relationships

- **`src/infrastructure/observability/analytics/index.ts`** — The module under test. All public exports (`resolveAnalyticsProvider`, `emitAnalyticsEvent`, `resetAnalyticsProvider`, `shutdownAnalytics`, `AnalyticsEvent` type) are imported and exercised here.
- **`src/modules/account/analytics.ts`** — `accountAnalyticsEvents` is imported to use real, app-recognised event constants rather than ad-hoc string literals.
- **`src/modules/products/analytics.ts`** — Same role; `productsAnalyticsEvents.PRODUCT_VIEWED` appears throughout.
- **`src/modules/cart/analytics.ts`** — Same role; `cartAnalyticsEvents.CART_ITEM_ADDED` and `CHECKOUT_COMPLETED` are the primary events in the Umami body-shape tests.
- **`src/modules/orders/analytics.ts`** — Same role; `ordersAnalyticsEvents.ORDER_CREATED` is used in the header-forwarding and `user_id`-spoof tests.

## Notes

- The `User-Agent` header test is explicitly marked as encoding a live-observed Umami bug (event silently dropped, response still `200`). Removing or loosening it will mask a silent data-loss regression.
- `sentRequest()` always reads `mock.calls[0]`. Tests that need a second call must `jest.clearAllMocks()` first (as the trace-id and IPv6 tests do).
- The PostHog mock is reached via `require('posthog-node')` rather than the ES import, because `jest.mock` registers the factory in CommonJS. The `eslint-disable` comment is intentional.
- Hostname port-stripping and IPv6 bracket tests encode a Umami 400-rejection that only manifests on non-default ports (`localhost:3000` in local dev). They are not style preferences; they gate a real integration failure.
