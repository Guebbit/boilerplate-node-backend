---
source: src/modules/payments/tests/integration/lookup.test.ts
sha256: a89d6ee3f4b4890679898854ad5d32122c2e8d18237542942ac684f2df69d7a4
generated_at: 2026-10-15T11:33:59.930812+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/lookup.test.ts

## Purpose

Integration test for the admin's RF-reference lookup path (`getOrderByReference`). It verifies that a `bank_transfer` order's own minted reference resolves back to that order, that mistyped/unmatched references all collapse to an indistinguishable 404, and that the two-step admin flow (lookup → settle via the existing `recordOfflinePayment` endpoint) works end-to-end with no additional settlement code.

## Key elements

- **`transferOrder()`** – Creates a user, a product, a pre-minted `buildReference` id, and a pending `bank_transfer` order whose `_id` is the same id used to build the reference. Returns `{ order, reference }` for use in assertions.
- **`orderIdOf(result)`** – Small helper that pulls `data._id` out of a service result shape.
- **`describe('getOrderByReference')`** – Six cases covering: exact match, case/space-insensitive match (customer reading off a bank statement), raw ObjectId rejection, single-character typo, valid-but-orphan reference (checksum passes, no order), and arbitrary garbage input. All miss-cases assert a uniform 404 via `asReject`.
- **`describe("lookup then settle")`** – One case that chains `getOrderByReference` into `recordOfflinePayment` (called with `callerContextAs('admin')`) and confirms the order's persisted status becomes `'paid'`.

## Relationships

- **`src/modules/payments/services/lookup.ts`** – Source of `getOrderByReference`, the function under test (imported via `services/index.ts`).
- **`src/modules/payments/services/offline.ts`** – Source of `recordOfflinePayment`, used in the settle step to prove the lookup's output feeds the existing offline endpoint unchanged.
- **`src/modules/payments/services/index.ts`** – Barrel re-export from which both service functions are imported.
- **`src/modules/orders/domain/transfer-reference.ts`** – Provides `buildReference`, used to mint a realistic reference bound to the order's own id.
- **`src/modules/orders/index.ts`** – Re-exports `buildReference`.
- **`src/modules/orders/tests/factories.ts`** – Provides `createOrder`, `readOrder`, `toOrderItem` for order setup and post-assertion reads.
- **`src/modules/products/tests/factories.ts`** – Provides `createProduct`.
- **`src/modules/users/tests/factories.ts`** – Provides `createUser`.
- **`tests/support/callers.ts`** – Provides `callerContextAs('admin')` for the settlement call.
- **`tests/support/response.ts`** – Provides `asReject` to unwrap the failure envelope and assert `.status`.
- **`tests/support/setup-test-db.ts`** – Provides `setupTestDb`, called at module top-level to seed/clean the Mongo test database.

## Notes

- The reference is deliberately built from the order's **own** `_id` (pinned before `createOrder`), mirroring how `cart` checkout mints it. This ensures the reference names the row it will be written to, not a transient second id.
- All four miss-cases (ObjectId, typo, orphan reference, garbage) must return **the same** 404 status; the test explicitly documents this as an anti-leak guarantee.
- The settle test does not assert on the *shape* of the offline endpoint's response beyond `success === true`; it only checks the persisted order status, keeping the test focused on the lookup→settle handoff rather than re-testing settlement internals.
