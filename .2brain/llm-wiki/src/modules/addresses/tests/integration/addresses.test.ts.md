---
source: src/modules/addresses/tests/integration/addresses.test.ts
sha256: 15889109d000b1de35f7b764137f20d7845ead52cf3d727fcd07bb62c2fda088
generated_at: 2026-09-23T18:21:44.713753+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/tests/integration/addresses.test.ts

## Purpose

Integration test suite for the address book module. Validates the module's three core invariants end-to-end against a real database: (1) a non-empty book has **exactly one** default regardless of which write set it, (2) another user's entry is indistinguishable from a non-existent one (404), and (3) the checkout resolver's three-way answer (named → default → none). Also verifies PII is encrypted at rest and round-trips correctly.

## Key elements

- **`HOME` / `OFFICE`** — Two address fixture objects used throughout the suite.
- **`defaults(userId)`** — Helper that calls `addressService.addressesGet` and returns only the entries flagged `default: true`.
- **`cartWith(userId)`** — Creates a product via the products factory and adds one unit to the user's cart; returns the product. Shared setup for every checkout case.
- **`describe('the one-default invariant')`** — Five tests covering: first-entry auto-default, explicit claim via update, `default: true` on add, `default: false` on update (no-op), and promotion of the oldest entry on removal.
- **`describe('ownership')`** — Single test asserting cross-user update/remove both return 404 and leave the owner's data untouched.
- **`describe('checkout and the address')`** — Five tests: snapshot default when no id named, named entry overrides default, stale id refuses checkout with `CART_ADDRESS_NOT_FOUND` and no side effects, foreign user's real id is refused identically (ownership, not existence), and empty book produces an order with `shippingAddress` undefined.
- **`describe('PII at rest')`** — Two tests: raw DB read shows versioned-secret ciphertext (not plaintext), and the repository decrypts back to the submitted values.

## Relationships

- **`src/modules/addresses/service.ts`** — Primary subject under test. Imported as `addressService` via relative path (`../../service`) for all CRUD operations (`addressAdd`, `addressUpdate`, `addressRemove`, `addressesGet`).
- **`src/modules/addresses/model.ts`** — Imported as `addressBookModel`; used only in the PII-at-rest test to bypass the repository's decryption layer and read raw stored fields.
- **`src/modules/cart/index.ts`** — Provides `cartService` for `cartItemAddById` (cart setup) and `orderConfirm` (checkout resolution under test).
- **`src/modules/cart/services/index.ts`** — Barrel re-export consumed through the cart index above.
- **`src/modules/users/tests/factories.ts`** — `createUser` supplies authenticated test identities.
- **`src/modules/products/tests/factories.ts`** — `createProduct` / `readProduct` build cart contents and let the suite assert inventory was untouched after a refused checkout.
- **`src/modules/orders/tests/factories.ts`** — `countOrders` confirms no order row was persisted after a refused checkout.
- **`tests/support/callers.ts`** — `testCallerContext` provides the caller argument `orderConfirm` requires.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the test database before the suite runs.

## Notes

- **Relative import for the service.** The file deliberately imports `../../service` rather than the `@modules/addresses` barrel. The project's barrel rule (CLAUDE.md) forbids a module's own tests from importing its own `index.ts`, so the test reaches the sibling file directly.
- **PII test reads raw storage.** The encryption assertion calls `addressBookModel.findOne(...).lean()` to simulate a stolen disk or raw DB read, intentionally bypassing the repository's decrypt path. The expected ciphertext shape is `^v\d+(?::[\da-f]+){3}$` (versioned-secret wire format).
- **Stale/foreign-id checkout tests assert zero side effects.** They verify product `onHand` remains 10, `reserved` remains 0, the cart is unchanged, and no order row exists — confirming the address check runs before any reservation or order write.
- **The foreign-entry checkout test is an ownership test, not an existence test.** Its inline comment explains that collapsing the split return type in `addressForCheckout` would let a foreign id silently downgrade to "no address" instead of a hard 404, which is the distinction this test guards.
