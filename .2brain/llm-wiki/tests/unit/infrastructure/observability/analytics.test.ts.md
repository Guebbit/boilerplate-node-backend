---
source: tests/unit/infrastructure/observability/analytics.test.ts
sha256: 181e3ee657e30a3d69c6c5138ab4384cab66e22bb5b6a091bf7a25e59f8c17d2
generated_at: 2026-10-15T13:17:11.762148+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/observability/analytics.test.ts

## Purpose

Unit tests for the analytics provider port and its three implementations (Umami, PostHog, none). Because the contract is fire-and-forget, the tests assert on the wire payload (URL, headers, JSON body) rather than on return values — what a provider sends is the only observable it exposes.

## Key elements

- **`configureUmami` / `configurePostHog` / `clearAnalyticsEnvironment`** — set or clear the environment variables that drive provider selection and per-provider config. `clearAnalyticsEnvironment` explicitly sets `NODE_ANALYTICS_REQUIRE_CONSENT` to `'false'` so tests exercise provider behaviour, not the consent gate.
- **`settle`** — a one-tick `setImmediate` helper; lets the fire-and-forget `fetch` chain resolve before assertions run.
- **`sentRequest`** — decodes the single `fetch` mock call into `{ url, headers, body }` for Umami assertions.
- **`resolveAnalyticsProvider` tests** — default-to-umami, explicit selection, memoisation, reset-then-re-read, and rejection of unknown provider names.
- **Umami provider tests** — URL construction (ingest host, trailing-slash tolerance, public-host fallback), mandatory `User-Agent`, `X-Forwarded-For` (present only when a client IP exists), `user_id` / `trace_id` in the body, caller-property precedence, abort-signal timeout, and property-overwrite protection.
- **PostHog provider tests** — exercise the mocked `PostHog` class (`capture`, `shutdown`) and verify event name, distinct ID, and properties are forwarded correctly.
- **`accountAnalyticsEvents`, `productsAnalyticsEvents`, `cartAnalyticsEvents`, `ordersAnalyticsEvents`** — imported as real constants so the events under test are ones the app actually emits, not arbitrary strings.
- **`callerAs` / `strangerCaller`** (from `tests/support/callers`) — used in tests that verify caller-context propagation into analytics events.

## Relationships

- **`src/infrastructure/observability/analytics/index.ts`** — the module under test; exports `resolveAnalyticsProvider`, `emitAnalyticsEvent`, `buildAnalyticsBase`, `shutdownAnalytics`, `resetAnalyticsProvider`, and the `AnalyticsEvent` / `AnalyticsEventInput` types.
- **`src/modules/{account,products,cart,orders}/analytics.ts`** — supply the canonical event-name constants used as inputs, guaranteeing the tests reference events the app truly emits.
- **`tests/support/environment.ts`** — `setEnvironment` is the sole mechanism for mutating `process.env` in tests; every provider-selection and configuration case funnels through it.
- **`tests/support/callers.ts`** — provides `callerAs` and `strangerCaller` for constructing realistic caller contexts in event-emission tests.

## Notes

- **User-Agent is non-obvious:** Umami 2.14 silently discards events without a `User-Agent` header while still returning HTTP 200. This behaviour is invisible from Umami's API docs and is pinned by a dedicated test case.
- **Memoisation:** `resolveAnalyticsProvider` caches on first call. Forgetting `resetAnalyticsProvider()` in `beforeEach` makes subsequent environment changes invisible; the test file calls it explicitly.
- **Consent gate is bypassed intentionally:** `clearAnalyticsEnvironment` sets the flag to `'false'` (not `undefined`) because the real default is `'true'`. A separate describe block covers the consent gate itself.
- **`settle` is required:** `emitAnalyticsEvent` fires the request and returns before the promise chain resolves. Assertions in the same tick will see no `fetch` call.
- **Absent vs. empty:** When no `clientIp` or `traceId` is supplied, the corresponding header/body key is *omitted*, not set to an empty string or `null`. Tests assert with `'key' in obj` rather than equality.
- **PostHog is fully mocked at the class level** via `jest.mock('posthog-node')`; the `require` cast (with an eslint-disable) is the only way to reach the mocked constructor for `mockImplementation`.
