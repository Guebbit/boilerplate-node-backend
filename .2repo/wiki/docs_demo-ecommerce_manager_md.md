# docs/demo-ecommerce/manager.md

## Purpose

Documentation page for the shop manager (staff) side of the demo e-commerce app. Describes the order state machine, product catalogue management (including soft-delete semantics), delivery pricing rules, customer account administration, and the audit-log guarantee — all behind the `root`/`rootroot` staff login.

## Key elements

- **Order lifecycle** — Mermaid flowchart showing the full state progression: `waiting for payment → paid → being prepared → shipped → delivered`, with cancellation and refund branches. Two transitions are automatic: shipping creates a parcel/tracking/email, and cancelling a paid order refunds by default.
- **Refund policy on cancel** — Customer-initiated cancel always refunds; staff-initiated cancel refunds unless explicitly overridden.
- **Catalogue / soft delete** — Deleting a product hides it from customers and baskets/wishlists but preserves the record for order history and restoration. A separate permanent-delete path exists.
- **Soft delete vs. switched off** — Two distinct hidden states demonstrated by two seeded products (150W Ceramic Heat Emitter = deleted; Rabbit Starter Bundle = switched off).
- **Stock constraint** — Stock quantities cannot be typed directly on a product; they change only through warehouse-recorded events (delivery, count correction). New-product creation is the sole exception (opening quantity).
- **Delivery pricing** — Fixed rules: Standard €5 (free over €100 basket), Express €15, Pickup €0. Quoted at checkout and charged at payment by the same logic.
- **Customer management** — List, search, edit, remove accounts (single or bulk); removal cascades basket, wishlist, address book.
- **Audit log** — Every staff action is recorded (who, when); 90-day retention; cannot be disabled in-app.
- **Glossary table** — Plain-English definitions of soft delete, switched off, refund, audit log, bulk.

## Relationships

- **→ `docs/modules/orders.md`** — Order states and transitions described here are implemented in the orders module; the page links there for full order API details.
- **→ `docs/modules/payments.md`** — The automatic refund on paid-order cancellation and the customer-cancels-always-refunds rule tie into the payments module.
- **→ `docs/modules/products.md`** — Soft-delete, switched-off, and bulk-edit semantics documented here are the product module's behaviors.
- **→ `docs/modules/delivery.md`** — The three delivery tiers and the €100 free-threshold are implemented there; the manager page only quotes the fixed rules.
- **→ `docs/modules/users.md`** — Customer list/search/edit/remove and cascade behavior are the users module's responsibilities.
- **→ `docs/modules/audit-logs.md`** — The 90-day, non-disableable audit trail is that module's guarantee; every manager action feeds it.
- **→ `docs/demo-ecommerce/warehouse.md`** — Stock changes are explicitly delegated to the warehouse page; the manager page notes it cannot edit stock directly.
- **→ `docs/demo-ecommerce/index.md`** — Parent index for the demo-ecommerce doc section; this page is one of its sibling pages.

## Notes

- The page is prose/documentation, not executable code — no functions, classes, or exports.
- Two seeded products are used to demonstrate the hidden-state distinction; their specific names and states are load-bearing for the example and should not be renamed without updating this page.
- The 90-day audit retention is stated as a hard guarantee with no in-app toggle; any implementation change must preserve that invariant.
- The "switching off" vs. "deleting" distinction is a core conceptual point of the page; conflating them in a refactor would break the documented user expectation.
