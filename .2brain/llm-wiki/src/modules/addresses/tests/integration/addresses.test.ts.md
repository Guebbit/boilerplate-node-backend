---
source: src/modules/addresses/tests/integration/addresses.test.ts
sha256: f980035ea3e2b823fdabaebe949c6941e9a555e8098414898735b75cbe1d5f8c
generated_at: 2026-09-27T14:40:13.077324+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/tests/integration/addresses.test.ts

## Purpose

Integration test suite for the address book module. It verifies four cross-cutting invariants: (1) a non-empty book always has exactly one default, (2) another user's entry is indistinguishable from a non-existent one (404), (3) the checkout resolver's three-way answer (default, named, or absent) and its failure modes, and (4) PII fields are stored encrypted and round-trip correctly through the repository.

## Key elements

- **`HOME` / `OFFICE`** — two fixture address objects (Modena, IT) used throughout as distinct entries.
- **`defaults(userId)`** — helper that calls `addressesGet` and returns only the entries flagged `default: true`.
- **`cartWith(userId)`** — helper that creates an in-stock product and adds one unit to the user's cart; returns the product for later stock assertions.
- **`describe('the one-default invariant')`** — five tests: first-entry auto-default, explicit claim via update, explicit claim via add, `default: false` is a no-op, and oldest-survivor promotion on removal.
- **`describe('ownership')`** — one test: a stranger's update/remove against a real foreign id returns 404 and leaves the owner's entry unchanged.
- **`describe('checkout and the address')`** — five tests covering: default resolution under `standard` shipping, named-entry override, stale-id rejection (404 + `CART_ADDRESS_NOT_FOUND` + no stock/order side-effects), foreign-id rejection (same contract as stale), and empty-book checkout under `pickup` (no address on order).
- **`describe('PII at rest')`** — two tests: raw Mongoose read (`.lean()`) confirms fields match the `v\d+` versioned-secret wire format (not plaintext), and a service-level read round-trips back to the submitted values.

## Relationships

- **`src/modules/addresses/service.ts`** — imported as `addressService` via a **relative** path (`../../service`), not the barrel. All CRUD calls (`addressAdd`, `addressUpdate`, `addressRemove`, `addressesGet`) go through it.
- **`src/modules/addresses/model.ts`** — imports `addressBookModel` directly, used *only* in the PII-at-rest test to bypass the repository's decrypt layer and inspect the raw stored representation.
- **`src/modules/cart/index.ts`** (→ `src/modules/cart/services/index.ts`) — imports `cartService` for `cartItemAddById`, `cartShippingMethodSet`, `orderConfirm`, and `cartGetForBadge`.
- **`src/modules/users/tests/factories.ts`** — `createUser` provides test accounts (owner, stranger, generic).
- **`src/modules/products/tests/factories.ts`** — `createProduct` / `readProduct` supply in-stock items and verify stock counts after rejected checkouts.
- **`src/modules/orders/tests/factories.ts`** — `countOrders` asserts that a failed checkout creates zero orders.
- **`tests/support/callers.ts`** — `testCallerContext` supplies the caller identity required by `orderConfirm`.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` resets/initializes the test database before the suite runs.

## Notes

- **Barrel-avoidance rule:** the import of `addressService` is deliberately relative (`../../service`) with an inline comment citing CLAUDE.md's rule that a module's own tests must not import through `index.ts`. Other cross-module imports (cart, users, products, orders) use the `@modules/…` alias freely.
- **PII test bypasses the domain layer:** `addressBookModel.findOne(...).lean()` is a raw Mongoose call that skips the repository's decrypt step, simulating what a stolen disk or raw query would expose. The expected format (`^v\d+(?::[\da-f]+){3}$`) is defined in `infrastructure/security/versioned-secret.ts`.
- **Ordering guarantees asserted:** the stale-id and foreign-id checkout tests explicitly verify that the address check fires *before* stock reservation and order creation (stock unchanged, cart intact, `countOrders === 0`), pinning the short-circuit position in the pipeline.
- **Shipping-method coupling:** `standard` requires an address (triggers resolution); `pickup` does not (empty book still succeeds). These two methods are the only ones exercised.
