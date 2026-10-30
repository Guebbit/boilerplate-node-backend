---
source: src/modules/cart/tests/integration/analytics-consent.test.ts
sha256: 98bdb6749c92e69c40228f3906ff40198fac6342ec7841d184fe996c9b8b9214
generated_at: 2026-10-29T03:26:36.843952+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/analytics-consent.test.ts

## Purpose

Integration test that verifies the `analyticsConsent` value stamped onto `cart_item_added` events by exercising the full HTTP stack (login → auth middleware → route → service). It locks in the consent-resolution rule: a stored account answer always wins; the `Analytics-Consent` request header is consulted only when the account was never asked.

## Key elements

- **`jest.mock('@infrastructure/observability/analytics', …)`** – Replaces the analytics module with a recording wrapper. Wraps the real `emitAnalyticsEvent` in a `jest.fn` so calls can be inspected. (See Notes for why `jest.spyOn` is not used.)
- **`addToCart(consent, header?)`** – Helper that creates a user (with or without a stored `analyticsConsent`), creates a product, logs in via bearer token, POSTs to `/cart/items`, and returns the matching `CART_ITEM_ADDED` event captured by the analytics port.
- **`describe('POST /cart/items — the consent a cart_item_added event carries', …)`** – Five cases covering every combination of stored consent (`true`, `false`, `undefined`) and header (`'true'`, `'false'`, absent), asserting the resulting `event.analyticsConsent` value.

## Relationships

- **`src/modules/cart/analytics.ts`** — Imports `cartAnalyticsEvents.CART_ITEM_ADDED` to filter the correct event from the port's call log.
- **`src/infrastructure/observability/analytics/index.ts`** — Mocked at module level; its `emitAnalyticsEvent` is the spy target the test asserts against.
- **`src/modules/users/tests/factories.ts`** — `createUser` builds the fixture user, including optional `analyticsConsent` / `analyticsConsentAt` fields.
- **`src/modules/products/tests/factories.ts`** — `createProduct` supplies a valid product ID for the cart-add payload.
- **`tests/support/http.ts`** — `api()` and `loginBearer` provide the HTTP client and token flow used to drive the real route.
- **`tests/support/ports.ts`** — `observePort` wraps a port function so individual calls can be inspected after the request completes.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-memory test database before any test runs.

## Notes

- The `jest.mock` factory spreads `requireActual` and overrides only `emitAnalyticsEvent`. This is a deliberate workaround: under the `swc` transpiler, a CommonJS namespace import exposes non-configurable properties that `jest.spyOn` cannot redefine.
- The test is intentionally integration-level: no route or service is mocked. The only seam is the analytics port, so the assertion covers the full consent-resolution logic as it actually ships.
- `consent === undefined` in the helper means "never asked" (no `analyticsConsent` column set), not `false`. The header is the only signal in that case.
