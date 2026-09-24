---
source: src/modules/payments/tests/integration/lookup.test.ts
sha256: 3da3fe33cf9883accb5e62b13d13bcb1c8f2f629b318d6a3bb91216f16924b1a
generated_at: 2026-09-23T19:23:15.166150+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/lookup.test.ts

## Purpose

Integration test for the admin's bank-transfer reference lookup (`getOrderByReference`) and its immediate downstream settle step (`recordOfflinePayment`). It pins the contract that a reference minted at checkout resolves to its own order, that any miss (typo, unmatched, malformed) yields a uniform 404 with no oracle, and that the order the lookup returns is the one the existing offline endpoint settles — with no new settlement logic in between.

## Key elements

- **`setupTestDb()`** — spins up a real MongoDB instance for the test run (integration, not mock).
- **`transferOrder()`** (local helper) — creates a user, product, and a pending `bank_transfer` order whose `_id` is pinned _before_ insertion so `buildReference(id)` names the exact row that is about to be written.
- **`orderIdOf()`** (local helper) — extracts `data._id` from a success envelope for assertions.
- **`describe('getOrderByReference')`** — six cases:
    - exact reference → success, correct order id
    - grouped + lowercased reference (simulating a bank-statement read) → still resolves
    - raw ObjectId passed in → 404 (order predates the reference field)
    - one-character typo → 404 (checksum rejection path)
    - well-formed but never-minted reference → 404 (lookup-miss path)
    - arbitrary string → 404 (same as typo)
- **`describe("lookup then settle — the admin's two-step flow")`** — calls `getOrderByReference`, then `recordOfflinePayment` on the found id, then reads the order back and asserts `status === 'paid'`.

## Relationships

| Neighbor                                          | Interaction                                                                        |
| ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `src/modules/payments/services/lookup.ts`         | Provides `getOrderByReference`, the function under test.                           |
| `src/modules/payments/services/offline.ts`        | Provides `recordOfflinePayment`, exercised in the settle test.                     |
| `src/modules/payments/services/index.ts`          | Barrel re-export; the test imports both service functions from here.               |
| `src/modules/orders/domain/transfer-reference.ts` | Source of `buildReference`, used to mint the reference and the "orphan" reference. |
| `src/modules/orders/index.ts`                     | Re-exports `buildReference` for the test's import.                                 |
| `src/modules/orders/tests/factories.ts`           | `createOrder`, `readOrder`, `toOrderItem` — order fixtures.                        |
| `src/modules/products/tests/factories.ts`         | `createProduct` — product fixture.                                                 |
| `src/modules/users/tests/factories.ts`            | `createUser` — user fixture.                                                       |
| `tests/support/callers.ts`                        | `testCallerContext` — auth context for the offline-payment call.                   |
| `tests/support/response.ts`                       | `asReject` — asserts the result is a rejection envelope and exposes `.status`.     |
| `tests/support/setup-test-db.ts`                  | `setupTestDb` — provisions the test database.                                      |

## Notes

- The id-pinning pattern (create ObjectId → build reference → pass id into `createOrder`) mirrors what the cart checkout does in production; it guarantees the reference refers to the row actually written, not a second id.
- The 404 cases are deliberately distinct branches (checksum fail vs. lookup miss vs. non-reference input) so a future refactor that collapses them would be caught.
- The settle test imports `recordOfflinePayment` from the _existing_ offline service — the test's job is to confirm no new settlement code was introduced between lookup and settle, not to test the offline service's own logic (that lives in `service.test.ts`).
