---
source: src/modules/returns/tests/integration/order-actions-parity.test.ts
sha256: 0effbb71bd12672e5a0f0353173b0eeb353574d05970dfb118a4cc0403c3ea02
generated_at: 2026-11-08T08:08:54.719929+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/order-actions-parity.test.ts

## Purpose

Integration test that pins the `OrderActions` flags returned to clients against the actual server responses for every combination of role × order status × action. It guarantees that a button is offered (`flag === true`) **iff** the corresponding endpoint returns a 2xx, and that a button is withheld **iff** the endpoint rejects. This catches any drift between the read-model flags and the write-side authorization logic.

## Key elements

- **`ROLES`** – The five swept roles: `customer` (owner), `admin`, `manager`, `warehouse`, `support`.
- **`STATUSES`** – All six `OrderStatus` values the sweep iterates over.
- **`OrderKind`** – `'ordinary' | 'mixed' | 'bespoke-only'`; used in the withdrawal sweep to vary line composition (made-to-order / no-withdrawal goods).
- **`signedIn()`** – Authenticates all five roles; returns the owner credential, the buyer `Caller`, and the full caller list.
- **`orderIn(owner, status, kind?)`** – Creates a realistic order in the given status via production paths (`createProduct`, `createOrder`, `carryOrderTo`, `fulfillmentOrdersOf`) and returns the order id.
- **`actionsFor(caller, orderId)`** – `GET /orders/:id` and returns the `actions` payload (or `undefined` if the caller cannot read the order).
- **`whyBlocked(caller, orderId)`** – Convenience wrapper that reads `actions.withdrawBlocked`.
- **`ACTS: Act[]`** – Seven boolean-flag actions (`cancel`, `process`, `withdraw`, `pay`, `delete`, `hardDelete`, `recordPayment`), each mapping its flag getter to the corresponding mutating request.
- **`accepted()`** – True for any 2xx status.
- **`describe('the button and its door agree')`** – Four tests:
  1. Boolean-flag parity across all roles × statuses for each `ACT` entry.
  2. `override` parity: the flag is an array of target statuses; sweeps every (role, from, to) triple.
  3. Withdrawal parity for the buyer across `OrderKind` × relevant statuses.
  4. `withdrawBlocked` reason is present for the buyer on a bespoke-only order, absent on a canceled order, and absent for all staff roles.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/products/tests/factories.ts` | `createProduct` to seed ordinary and made-to-order (no-withdrawal) goods. |
| `src/modules/orders/tests/factories.ts` | `createOrder`, `toOrderItem`, `forceOrderStatus` to build orders in arbitrary states. |
| `src/modules/delivery/tests/factories.ts` | `carryOrderTo` to advance shipped/delivered orders; `fulfillmentOrdersOf` to create the fulfillment records a payment event would produce. |
| `src/modules/payments/module.ts` | Registered in `beforeEach` so the `/payments` and `/orders/:id/payments` doors are live. |
| `src/modules/returns/module.ts` | Registered in `beforeEach` so the `/returns` door (withdrawal) is live. |
| `src/types/index.ts` | `OrderStatus` enum and `OrderActions` type shape the sweep dimensions and assertions. |
| `tests/support/checkout-modules.ts` | `registerCheckoutModules` wires the payment and returns modules into the app under test. |
| `tests/support/http.ts` | `api()` (supertest agent) and `authenticateAsRole` for all HTTP calls and auth. |
| `tests/support/setup-test-db.ts` | `setupTestDb` initialises the in-memory database before the suite. |

## Notes

- Each cell in the sweep gets a **fresh order** because the door mutates state; reusing an order would make subsequent assertions unreliable.
- The `bothOpen > 0` guard in every test prevents a vacuous pass where both the flag and the door always reject (a broken registration would look like a "correct" negative).
- `override` is **not** in `ACTS` because its flag is a status array, not a boolean; it is swept in its own test against every destination status.
- The withdrawal kind-sweep only covers `pending`, `paid`, and `processing` — statuses where a withdrawal is semantically possible.
- `withdrawBlocked` is asserted to be `undefined` for all four staff roles on a bespoke-only order, confirming the reason is a buyer-only concern.
- Documented known edge (not swept): a mixed `processing` order whose eligible groups are already canceled still shows the button but a second withdrawal returns `409 RETURN_NOTHING_TO_CANCEL`. See `docs/modules/returns.md#goods-with-no-right-of-withdrawal`.
