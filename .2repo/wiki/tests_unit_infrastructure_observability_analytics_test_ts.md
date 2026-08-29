# tests/unit/infrastructure/observability/analytics.test.ts

## Purpose

Unit tests for the analytics provider port (`@infrastructure/observability/analytics`) and its two implementations (Umami, PostHog). Because the emit contract is fire-and-forget by design, every assertion targets the decoded wire payload (URL, headers, JSON body) rather than a return value—the payload is the only observable a provider has.

## Key elements

- **`resolveAnalyticsProvider` tests** — verify default-to-umami, explicit selection via `NODE_ANALYTICS_PROVIDER`, hard-throw on unknown names (with the valid list in the message), memoisation, and re-read after `resetAnalyticsProvider()`.
- **Umami provider tests** — assert the `fetch` call to `/api/send`: correct URL (ingest host, trailing-slash tolerance, public-host fallback), `type: "event"` body shape, `User-Agent` always present, caller `User-Agent` forwarding, `X-Forwarded-For` set/omitted based on `clientIp`, `user_id` from `distinctId`, `trace_id` present/absent, caller `properties` merged without overwriting `user_id`, hostname port-stripping (including IPv6 brackets), and the missing-website-id warn-and-skip path.
- **PostHog provider tests** — exercised through a jest-mocked `posthog-node` class (`mockCapture`, `mockShutdown`); verifies `capture()` receives the correct event name and properties.
- **Helpers** — `configureUmami()`, `configurePostHog()`, `clearAnalyticsEnvironment()` set/clear the relevant `NODE_*` env vars; `settle()` yields a macrotask so the fire-and-forget `fetch` chain resolves before assertions; `sentRequest()` decodes the first `globalThis.fetch` mock call into `{url, headers, body}`.
- **Mocks** — `posthog-node` (PostHog constructor), `@infrastructure/adapters/logger` (warn/debug spies), and `globalThis.fetch` (resolved `{ok, status:200}`).

## Relationships

- **`src/infrastructure/observability/analytics/index.ts`** — the module under test; imports `resolveAnalyticsProvider`, `resetAnalyticsProvider`, `emitAnalyticsEvent`, `buildAnalyticsBase`, `shutdownAnalytics`, and the `AnalyticsEvent` type.
- **`src/modules/account/analytics.ts`**, **`src/modules/products/analytics.ts`**, **`src/modules/cart/analytics.ts`**, **`src/modules/orders/analytics.ts`** — imported solely for their typed event-name constants (`accountAnalyticsEvents`, `productsAnalyticsEvents`, etc.) so that test payloads use real event identifiers rather than string literals.
- **`tests/cross-cutting/contract-search-parity.test.ts`** — graph neighbor; no direct import or shared mock is visible in this file.

## Notes

- **Umami `User-Agent` quirk**: an event posted without a `User-Agent` header is silently discarded (response is still `200`). This behaviour was discovered against a live Umami 2.14 instance and is not derivable from the API docs; the test pins it.
- **`settle()` is required**: `capture()` (PostHog) and the Umami `fetch` chain are asynchronous; asserting on the same tick would race the provider's own `.then`. The helper yields via `setImmediate`.
- **Hostname port stripping**: Umami rejects any hostname carrying a port with a `400`. The provider strips `:port` from plain hosts but preserves bracketed IPv6 literals (`[::1]`).
- **`X-Forwarded-For` omission vs. empty**: when no `clientIp` is supplied the header is absent entirely—sending it empty would make Umami hash an empty address as a real one.
- **Provider memoisation**: `resolveAnalyticsProvider()` caches on first call; only `resetAnalyticsProvider()` re-reads the environment. Tests that change `NODE_ANALYTICS_PROVIDER` mid-suite must call the reset first.
