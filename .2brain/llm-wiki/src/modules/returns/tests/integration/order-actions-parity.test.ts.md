---
source: src/modules/returns/tests/integration/order-actions-parity.test.ts
sha256: 1da4d7bbfa0c1323dda17f2e3316382f90dc72f87a88951943deffc01854c1c2
generated_at: 2026-11-14T21:43:54.062522+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/order-actions-parity.test.ts

## Purpose

Integration test that pins the `OrderActions` flags a client renders as buttons to the actual server endpoints behind them. For every role × order-status × action, it asserts the flag is `true` **if and only if** the corresponding API call returns a 2xx, so a button can never appear without a working door (or vice versa).

## Key elements

- **`ACTS`** — array of seven actions (cancel, process, withdraw, pay, delete, hardDelete, recordPayment). Each entry pairs a boolean flag getter on `OrderActions` with the HTTP "door" call that exercises it.
- **`signedIn()`** — authenticates all five roles (customer, admin, manager, warehouse, support); the customer is the order owner, the rest are non-owning staff.
- **`orderIn(owner, status, kind?)`** — creates an order in the target status using product factories, then drives it through delivery (`carryOrderTo`) or creates fulfillment orders (`fulfillmentOrdersOf`) so paid/processing/shipped/delivered states are realistic.
- **`actionsFor(caller, orderId)`** — GETs the order detail and returns the `actions` object (or `undefined` if the caller lacks read access).
- **`accepted(response)`** — true for any 2xx status.
- **Test: "on \*name, for every role and every status"** — the main parity sweep over `ACTS` × `STATUSES` × `ROLES`.
- **Test: "on override, …"** — sweeps `overrideStatus` (an array flag) as a from-status × to-status × role matrix.
- **Test: "on withdraw, … over what the order is made of"** — buyer-only sweep across `ordinary` / `mixed` / `bespoke-only` order kinds at three pre-fulfillment statuses.
- **Test: "says why the button is off …"** — asserts `withdrawBlocked` is `'all_excluded'` for a buyer with a bespoke-only order, `undefined` for a canceled order, and `undefined` for all staff roles.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises the in-memory DB at module load (top-level call). |
| `tests/support/checkout-modules.ts` | `registerCheckoutModules` mounts `paymentsModule` and `returnsModule` into the test HTTP app in `beforeEach`. |
| `tests/support/http.ts` | `api()` builds supertest requests; `authenticateAsRole` obtains bearer tokens per role. |
| `src/modules/products/tests/factories.ts` | `createProduct` makes the ordinary and bespoke (`noWithdrawal: true`) products used to build order items. |
| `src/modules/orders/tests/factories.ts` | `createOrder`, `toOrderItem`, `forceOrderStatus` create and manipulate orders. |
| `src/modules/delivery/tests/factories.ts` | `carryOrderTo` advances an order to shipped/delivered; `fulfillmentOrdersOf` creates the fulfillment records a paid order would have. |
| `src/modules/payments/module.ts` | Registered as a mounted module so payment-related doors (pay, recordPayment) are routable. |
| `src/modules/returns/module.ts` | The module under test; registered so the `/returns` door exists. |
| `src/types/index.ts` | `OrderStatus` enum and `OrderActions` interface drive the sweep dimensions and flag access. |

## Notes

- **Each assertion cell gets a fresh order** because the "door" call mutates state; reusing an order would make the flag/door comparison meaningless.
- **`overrideStatus` is swept separately** because it is an array of allowed destinations, not a single boolean; the parity check becomes `offered.includes(to) === doorOpen`.
- **`bothOpen > 0` guard** — every test asserts at least one cell where both sides agree on *open*, preventing a vacuous pass where everything is uniformly denied.
- **`setupTestDb()` is top-level**, not inside `beforeEach`; module registration is per-test. Don't move either without checking the test-runner lifecycle.
- **Documented known edge (not swept):** a mixed `processing` order whose eligible groups are already canceled still shows the withdraw button (lines are frozen) but a second withdrawal returns 409 `RETURN_NOTHING_TO_CANCEL`. See `docs/modules/returns.md#goods-with-no-right-of-withdrawal`.
- **`withdrawBlocked` is buyer-only** by design; staff roles are expected to always see `undefined` for that field.
