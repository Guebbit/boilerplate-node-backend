---
source: src/modules/cart/tests/integration/analytics-consent.test.ts
sha256: 98bdb6749c92e69c40228f3906ff40198fac6342ec7841d184fe996c9b8b9214
generated_at: 2026-11-08T05:19:05.007246+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/analytics-consent.test.ts

## Purpose

Integration test that verifies which analytics consent value a `cart_item_added` event carries after traversing the real HTTP stack (auth middleware → route → service). It asserts the consent-priority rule defined in `docs/theory/data-protection.md`: a stored account answer always outranks the `Analytics-Consent` banner header; only an account that was never asked falls back to the header (or defaults to `false`).

## Key elements

- **`addToCart(consent, header?)`** — helper that creates a user with the given `analyticsConsent` state (or leaves it unset), creates a product, logs in, issues `POST /cart/items` with the optional `Analytics-Consent` header, and returns the recorded `cart_item_added` analytics event.
- **`jest.mock('@infrastructure/observability/analytics')`** — replaces `emitAnalyticsEvent` with a `jest.fn` wrapper around the real implementation so calls can be inspected.
- **`describe('POST /cart/items — the consent a cart_item_added event carries')`** — five cases covering the full consent matrix:
  - stored `true` → granted
  - stored `true` + header `false` → still granted (stored wins)
  - stored `false` + header `true` → still refused (withdrawal not undone)
  - never-asked + header `true` → granted (header is used)
  - never-asked + no header → refused (default)

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/observability/analytics/index.ts` | Mocked via `jest.mock`; its `emitAnalyticsEvent` is wrapped to record calls. |
| `src/modules/cart/analytics.ts` | Provides the `cartAnalyticsEvents.CART_ITEM_ADDED` identifier used to filter the recorded event. |
| `src/modules/users/tests/factories.ts` | `createUser` builds the test account with or without a stored consent. |
| `src/modules/products/tests/factories.ts` | `createProduct` supplies the item to add to the cart. |
| `tests/support/http.ts` | `api` (supertest client) and `loginBearer` (auth token acquisition). |
| `tests/support/ports.ts` | `observePort` wraps the spied function to expose its `mock.calls`. |
| `tests/support/setup-test-db.ts` | `setupTestDb` initialises the in-memory database before all tests. |

## Notes

- The mock deliberately avoids `jest.spyOn` on the namespace import because swc's CJS interop marks the property non-configurable; the recording-wrapper pattern is the documented workaround (see the block comment above the `jest.mock` call).
- The test asserts only the `analyticsConsent` field on the emitted event; it does not assert event shape, ordering, or other payload fields.
- The consent-priority contract is specified in `docs/theory/data-protection.md`—update that doc and this test together when the rule changes.
