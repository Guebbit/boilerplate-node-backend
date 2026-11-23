---
source: src/modules/cart/tests/integration/analytics-consent.test.ts
source_sha256: 9a20e095fd30ac1d79b9a4723bac96f9227c7090a6039ba19eba7baa6676de20
context_sha256: 12a0ece89be3d5c44d1979dc4f4606803ee8937ca9af2e6676d70ddb6d426ec1
generated_at: 2026-11-22T04:37:38.521355+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/tests/integration/analytics-consent.test.ts

## Purpose
Integration test verifying whose analytics consent a `cart_item_added` event carries when an item is added via `POST /cart/items`. It exercises the real stack (login, auth middleware, route, service) and asserts that a stored account answer outranks the `Analytics-Consent` banner header, while the header is used only for accounts that were never asked.

## Key elements
- **`jest.mock('@infrastructure/observability/analytics', ...)`**: replaces the module with the real implementation spread in, but with `emitAnalyticsEvent` wrapped in `jest.fn(actual.emitAnalyticsEvent)`, so calls are recorded while the real behavior still runs.
- **`setupTestDb()`**: sets up the test database for the suite.
- **`addToCart(consent, header?)`**: helper that creates a verified user (setting `analyticsConsent` and `analyticsConsentAt` unless `consent` is `undefined`), creates a product, logs in for a bearer token, and posts `{ productId, quantity: 1 }` to `/cart/items`, optionally with an `Analytics-Consent` header. It asserts HTTP 200 and returns the emitted event whose `event` equals `cartAnalyticsEvents.CART_ITEM_ADDED`.
- **Test cases** (`describe` block), checking `event.analyticsConsent`:
  - opted in → `true`
  - stored `true`, header `'false'` → `true`
  - stored `false`, header `'true'` → `false`
  - never asked, header `'true'` → `true`
  - never asked, no header → `false`

## Relationships
- `src/infrastructure/observability/analytics/index.ts`: the mocked module; `emitAnalyticsEvent` is wrapped and observed via `observePort`.
- `src/modules/cart/analytics.ts`: supplies the `cartAnalyticsEvents` export, whose `CART_ITEM_ADDED` entry is used to find the relevant event.
- `src/modules/users/tests/factories.ts`: `createUser` builds users with or without a stored consent answer.
- `src/modules/products/tests/factories.ts`: `createProduct` supplies the product added to the cart.
- `tests/support/http.ts`: `api()` for requests and `loginBearer()` for the auth token.
- `tests/support/ports.ts`: `observePort()` exposes the mock's calls.
- `tests/support/setup-test-db.ts`: `setupTestDb()` provides database lifecycle.

## Notes
- The recording wrapper uses `jest.mock` rather than `jest.spyOn` because `jest.spyOn` cannot redefine the non-configurable property a CommonJS namespace import exposes under swc.
- `addToCart` returns `undefined` if no matching event was emitted, so assertions use `event?.analyticsConsent`.
