# src/modules/cart/tests/integration/service.test.ts

## Purpose

Integration test suite for the cart service layer, running against a real MongoDB instance (`setupTestDb`). It exists to pin the highest-risk seam in the module — the shared `upsertCartItem` path behind both `set` and `add`, where a collapsed `$set`/`$inc` distinction would silently corrupt a user's quantity — and to guard the serialization contract (no extra keys on `CartItem`, no per-line `_id`) that a mock cannot exercise because the behaviour lives inside the repository's guarded writes.

## Key elements

- **`describe('cart storage')`** — verifies document lifecycle: no cart until first write, `createdAt` stamped on upsert-insert, single cart per user, `updatedAt` refresh, and that a line is exactly `{ productId, quantity }` with no generated sub-document `_id`.
- **`describe('cartGet')`** — read path returning populated items; confirms the product is populated, that a deleted product yields `product: null` while `productId` survives, and that a missing user resolves to `[]` rather than throwing.
- **`describe('cartGetForBadge')`** — the lean variant: asserts `additionalProperties:false` (exactly `productId` + `quantity` per item), correct multi-line summary math, and the zeroed `EMPTY_CART` shape.
- **`describe('cartItemSetById')`** — the `set` path: add-new, **replace** (2 not 7), default quantity 1, isolation of other lines, success response shape, and catalogue-gate rejection (draft/non-public products).
- **`describe('cartItemAddById')`** (implied by imports) — the `add` / `$inc` path, distinguished from `set` by accumulation semantics.
- **`describe('cartItemRemoveById')`**, **`describe('cartRemove')`**, **`describe('orderConfirm')`**, **`describe('productRemoveFromCartsById')`** (implied by imports) — remaining service surface.
- **`mockEnqueueEmail`** — the only mock; pins that `orderConfirm` *dispatches* (calls `enqueueEmail`) rather than asserting on email copy.
- **`storedQuantity(userId, productId)`** — helper that reads the persisted quantity back from `cartRepository` so assertions survive the Mongo round-trip.
- **`asReject(result)`** — type-narrowing helper for already-failed service responses (`ResponseReject`).
- **`EMPTY_CART`** — canonical shape `{ items: [], summary: { itemsCount: 0, totalQuantity: 0, total: 0 } }`.
- **`MISSING_ID`** — structurally valid ObjectId present in no collection, used for "user does not exist" cases.

## Relationships

- **`src/modules/cart/services/index.ts`** — source of every function under test (`cartGet`, `cartItemSetById`, `cartItemAddById`, `cartItemRemoveById`, `cartRemove`, `cartGetForBadge`, `orderConfirm`, `productRemoveFromCartsById`).
- **`src/modules/cart/repository.ts`** — used directly for assertions (`findByUserId`, `count`) and as the system-under-test target (its `upsertLine` guarded writes are what these tests exercise).
- **`src/modules/cart/module.ts`**, **`src/modules/inventory/module.ts`**, **`src/modules/delivery/module.ts`**, **`src/modules/account/module.ts`** (plus `products`, `users`, `orders` modules) — registered via `registerModules` so the full service graph resolves.
- **`src/kernel/registry.ts`** — `registerModules` wires module dependencies before each test run.
- **`src/kernel/events.ts`** — `resetDomainEvents` clears the in-memory event bus between tests.
- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` is mocked; the test asserts it was *called* (dispatch happened) without inspecting email content.
- **`src/infrastructure/http/response.ts`** — `ResponseReject` type imported for the `asReject` narrowing helper.
- **`src/infrastructure/i18n/index.ts`** / **`context.ts`** — `t` imported for assertions on localized error messages.

## Notes

- **Real Mongo, not mocks.** The file deliberately uses `setupTestDb` because the behaviour under test (guarded `$set` vs `$inc` writes, upsert-insert `createdAt`, `additionalProperties` enforcement) lives in the repository layer and cannot be faithfully simulated by a mock.
- **`set` vs `add` is the single most important distinction.** Both funnel into one private `upsertCartItem`; the only difference is `$set` (replace) vs `$inc` (accumulate) on one repository line. The `cartItemSetById` "REPLACES" test (expecting 2, not 7) is the regression guard for a collapsed mutation.
- **Serialization contract is structural.** `CartItem` is `additionalProperties:false`; tests assert `Object.keys` equality to catch accidental extra fields (e.g. a populated `product` leaking into the badge variant, or a generated sub-doc `_id`).
- **Only the mailer is mocked.** Everything else — repositories, services, module wiring — runs for real. This means tests are slow and order-dependent on DB state; `setupTestDb` handles teardown.
- **`createdAt` on insert relies on Mongoose `timestamps`.** The cart is born from an upsert (not a `create()`), so the test that `createdAt` is a `Date` guards the `timestamps` option reaching the insert branch specifically.
