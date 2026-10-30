---
source: src/modules/returns/tests/integration/order-actions-parity.test.ts
sha256: b0f9997839e36063e63ac6a651a81a9fb42e52ab098c33284a2dd13fed739e02
generated_at: 2026-10-29T05:47:30.821211+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/order-actions-parity.test.ts

## Purpose

Integration test that pins the `OrderActions` flags returned on the order resource (what the client renders as buttons) to the actual server endpoints (what the server accepts). For every role × order-status × action combination, it asserts the flag is `true` **if and only if** the corresponding endpoint returns a 2xx, and that at least one cell per sweep actually opens (guards against a vacuous all-`false` pass).

## Key elements

- **`ROLES`** — the five caller roles swept: `customer` (order owner), `admin`, `manager`, `warehouse`, `support`.
- **`STATUSES`** — all six `OrderStatus` values.
- **`ACTS`** — array of `Act` objects (`cancel`, `process`, `withdraw`, `pay`, `delete`, `hardDelete`, `recordPayment`), each pairing a boolean flag getter with the HTTP request the server exposes.
- **`orderIn(owner, status, kind)`** — creates a fresh order in the given status via production-path factories (shipped/delivered go through `carryOrderTo`; paid/processing get fulfillment orders). `kind` selects ordinary / mixed / bespoke-only line composition.
- **`actionsFor(caller, orderId)`** — GETs the order and extracts `OrderActions`; returns `undefined` when the caller lacks read access.
- **`signedIn()`** — authenticates all five roles, returning the owner context and a `Caller` list.
- **Test: "on $name, for every role and every status"** — iterates every `ACT` entry across all roles × statuses; a fresh order per cell because the door mutates.
- **Test: "on override, …"** — swept separately because `override` is an array of allowed destination statuses rather than a single boolean; checks membership for each destination.
- **Test: "on withdraw, … over what the order is made of"** — additional sweep of the buyer's `withdraw` flag across `ordinary`, `mixed`, `bespoke-only` kinds at `pending`/`paid`/`processing`.
- **Test: "says why the button is off …"** — asserts the `withdrawBlocked` reason string is `'all_excluded'` for a buyer on a bespoke-only paid order, `undefined` for a cancelled order, and `undefined` for every staff role.

## Relationships

- **`tests/support/setup-test-db.ts`** — calls `setupTestDb()` once at module load to provision the in-memory database.
- **`tests/support/checkout-modules.ts`** — `registerCheckoutModules` mounts the payments and returns modules into the HTTP app each test.
- **`tests/support/http.ts`** — provides `api()` (supertest-style request helper) and `authenticateAsRole` for bearer-token auth.
- **`src/modules/products/tests/factories.ts`** — `createProduct` builds the goods (ordinary and `noWithdrawal` bespoke) used in order lines.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `forceOrderStatus`, `toOrderItem` construct and mutate orders.
- **`src/modules/delivery/tests/factories.ts`** — `carryOrderTo` advances an order to shipped/delivered; `fulfillmentOrdersOf` creates the fulfillment records a payment event would produce.
- **`src/modules/payments/module.ts`** — registered so `/payments` and `/orders/:id/payments` endpoints are live during the sweep.
- **`src/modules/returns/module.ts`** — the module under test; registered so `POST /returns` is live.
- **`src/types/index.ts`** — source of the `OrderStatus` enum and the `OrderActions` interface that defines the flag contract.

## Notes

- Each role × status cell gets its **own order** because the door endpoints (`cancel`, `process`, `withdraw`, `pay`, `delete`, `hardDelete`, `recordPayment`) all write; reusing an order would leak state.
- `override` is deliberately excluded from the `ACTS` array and swept in its own test because its flag is a list of destinations, not a scalar boolean.
- The `bothOpen > 0` assertion in every test prevents a false pass where both sides consistently say "no."
- The known edge case (mixed `processing` order with already-cancelled eligible groups keeping its button while a second withdrawal returns 409 `RETURN_NOTHING_TO_CANCEL`) is **not** covered by this sweep; see `docs/modules/returns.md#goods-with-no-right-of-withdrawal`.
- The `withdrawBlocked` reason test uses `forceOrderStatus` to create a cancelled order without going through the cancel endpoint, isolating the reason-string logic.
