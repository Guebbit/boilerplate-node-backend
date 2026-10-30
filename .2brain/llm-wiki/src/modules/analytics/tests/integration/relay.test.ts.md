---
source: src/modules/analytics/tests/integration/relay.test.ts
sha256: 034b4fde357d0a65b822efabf47542eb092f584cf52dfb10fae106f48f9a2218
generated_at: 2026-10-29T03:11:45.337422+00:00
model: ollama:qwen3.8:27b
---

# src/modules/analytics/tests/integration/relay.test.ts

## Purpose

Integration test for the `POST /analytics/events` relay endpoint. Verifies the relay's core guarantee — that no event reaches the analytics provider without an explicit consent header, and that the HTTP response is `204` in both the consented and non-consented paths. Also covers payload validation (closed event-name set, unknown-field rejection, format checks) driven through the real application stack.

## Key elements

- **`beforeEach` block** — sets `NODE_ANALYTICS_PROVIDER: 'none'` and `NODE_ANALYTICS_REQUIRE_CONSENT: 'true'`, resets the provider singleton, and installs a `jest.spyOn` on `resolveAnalyticsProvider().capture`.
- **Consent gating tests** — assert `204` + zero `capture` calls without the `Analytics-Consent` header; assert `204` + exactly one `capture` call when the header is present.
- **Event-shape assertions** — verify `capture` receives the expected `event` name and a `properties` object with snake_case keys (`product_id`, `result_count`, etc.) derived from the camelCase request body.
- **Validation / rejection tests** — unknown event name (`order_created`), unknown extra field (`email`), malformed `productId` (not 24 hex chars), and empty search `text` all yield `422` with `capture` never called.

## Relationships

- **`src/infrastructure/observability/analytics/index.ts`** — imports `resetAnalyticsProvider` and `resolveAnalyticsProvider`; the test spies on the resolved provider's `capture` method to assert what (if anything) is relayed.
- **`tests/support/http.ts`** — imports the `api` helper to issue real HTTP requests through the running app rather than calling route handlers directly.
- **`tests/support/environment.ts`** — imports `setEnvironment` to override `NODE_ANALYTICS_*` variables per test case.
- **`tests/support/setup-test-db.ts`** — imports `setupTestDb` to provision a clean database before the suite runs.

## Notes

- Consent is signalled exclusively via the `Analytics-Consent: true` request header; it is never read from the body or query string.
- The provider is configured as `'none'`, yet `resolveAnalyticsProvider()` still returns a callable object — the spy relies on that. Do not change the provider to a concrete name or the spy will attach to a different implementation.
- Product IDs are validated as 24-character hex strings (MongoDB ObjectId shape). The test constant `PRODUCT_ID` is the canonical fixture for that check.
- The event-name set is closed: anything not explicitly listed in the relay's schema (e.g. `order_created`) is rejected with `422`, even when consent is present.
- Extra body fields are not silently stripped; they cause a `422`. This is a strictness guarantee the test pins down.
