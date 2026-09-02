# docs/modules/payments.md

## Purpose

Owns the monetary side of an order: creating a payment intent that freezes the total, and confirming the payment that moves the order to `paid` and commits held inventory. All provider-specific logic sits behind a port, so the rest of the system is processor-agnostic.

## Key elements

- **Create intent** — freezes the order's total; `unique: true` on `orderId` enforces one payment per order at the database level (double-charge guard).
- **Confirm** — the single critical path: calls the provider port, transitions the order to `paid` (via `orders`), and commits the held units (via `inventory`). On provider decline the order stays pending and units remain held.
- **Refund handler** — listens for the `order.cancelled` domain event from `orders` and issues a refund if one was due.
- **Provider port** — an interface with a deliberately fake default implementation; swapping in a real processor (e.g. Stripe) is one file behind that interface. Nothing above `providers/` knows which is wired.
- **`userId` resolution** — resolves the order's `userId` against the `users` account record so the payer id on a payment document is queryable later. An unresolvable payer is logged, not refused.

## Relationships

- **`orders`** (import + event): payments moves an order to `paid` on confirm; `orders` emits `order.cancelled` which payments answers with a refund.
- **`inventory`** (import): confirm commits the held units; without this step holds expire without ever becoming sales.
- **`users`** (import + event): payments resolves the payer against the account record; `users` emits `user.deleted` that payments must handle.
- **`payments-provider-port`**: the interface and fake implementation that this module calls during confirm.
- **`inventory-reservations`**: the hold/commit lifecycle this module's confirm step concludes.
- **`demo-ecommerce/shopper.md` / `demo-ecommerce/manager.md`**: the demo profile exercises the full checkout-to-paid path using the fake provider.
- **`theory/layers.md`**: defines what a port is and where it sits in the architecture.
- **`tools/security.md`**: documents that payment secrets are never stored in this module.
- **`api/endpoints.md`**: exposes the intent/confirm actions over the API surface.

## Notes

- The confirm path is the only place a hold becomes a sale; changing it affects inventory commitments, order status, and the refund path simultaneously.
- The fake provider is intentional, not a placeholder — it is what lets tests and the demo profile run without a sandbox account.
- `unique: true` on `orderId` is a schema-level invariant, not an application-level check; do not replace it with a pre-query guard.
- The dependency on `users` is groundwork: no current screen queries "everything this account has paid," but the id is stored now so it is queryable later.
