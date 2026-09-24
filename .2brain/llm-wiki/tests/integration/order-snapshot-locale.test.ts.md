---
source: tests/integration/order-snapshot-locale.test.ts
sha256: 1dda761a8efe127ae88d0fc7452bcc278650438b643f8ae7e264a9787804aa06
generated_at: 2026-09-23T20:05:12.025058+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/order-snapshot-locale.test.ts

## Purpose

Integration test verifying that order line snapshots freeze the **buyer's** stored locale at creation time, not the caller's or request's locale. Covers both the `orderService.create` (admin/operator path) and `cartService.orderConfirm` (self-checkout path) entry points.

## Key elements

- **`givenLocale(tag)`** — helper that creates a `Locale` document via `localeRepository.create` + `makeLocale`.
- **`givenTranslation(productId, locale, fields)`** — helper that upserts a product translation row via `translationRepository.upsertEntityLocale`; passes `undefined` as the source-text param for the fallback locale, `'digest'` otherwise.
- **`FALLBACK`** — constant `'en'`, the fallback locale shared across all environments (see `.env-example`).
- **`describe("orderService.create freezes the snapshot…")`** — two cases: (1) Italian buyer / English caller → item embeds Italian title, description, and `locale: 'it'`; (2) no Italian translation exists → source text is used but `locale` is still `'it'`.
- **`describe("cartService.orderConfirm freezes the snapshot…")`** — one case: sets a cart item then confirms the order, asserting the same locale-freeze behavior.

## Relationships

- **`src/modules/orders/index.ts`** — source of `orderService`; the test calls `orderService.create` directly.
- **`src/modules/orders/services/index.ts`** — underlying implementation the index re-exports; the test exercises `resolveSnapshotProducts` indirectly (the `_id` assertion in case 1 exists to pin that behavior).
- **`src/modules/cart/index.ts`** — source of `cartService`; the test calls `cartService.cartItemSetById` then `cartService.orderConfirm`.
- **`src/modules/cart/services/index.ts`** — underlying implementation behind the cart service calls.
- **`src/modules/locales/repository.ts`** — `localeRepository` and `translationRepository` are called by the `givenLocale` / `givenTranslation` helpers to seed test data.
- **`src/modules/locales/factories.ts`** — `makeLocale` used to construct locale documents in the helper.
- **`src/modules/users/tests/factories.ts`** — `createUser` seeds a buyer with a specific `locale` field.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds the product whose title/description get snapshotted.
- **`tests/support/callers.ts`** — `testCallerContext` provides the (deliberately wrong-locale) caller identity passed to both services.
- **`tests/support/http.ts`** — side-effect import to register HTTP test utilities.
- **`tests/support/response.ts`** — `asSuccess` unwraps the `Result` type returned by both services.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` is called at module top-level to provision a clean database before any test runs.

## Notes

- **Why top-level `tests/integration/`**: the scenario spans `orders`, `cart`, and `locales` modules simultaneously, so it doesn't belong under any single module's `tests/` directory (same rationale documented for `translation-resolution.test.ts`).
- **Caller locale is intentionally wrong**: every test passes `locale: 'en'` in the caller context while the buyer is `'it'`, so a regression that lets the caller locale win is caught immediately.
- **`_id` stability assertion**: `expect(String(order.items[0].product._id)).toBe(String(product._id))` guards against `resolveSnapshotProducts` switching from `.toObject()` to `.toJSON()`, which would mint a new ObjectId.
- **`givenTranslation`'s source-text param**: the positional `undefined` vs `'digest'` arg is locale-dependent (fallback vs. non-fallback); this mirrors production upsert semantics rather than being test-specific logic.
