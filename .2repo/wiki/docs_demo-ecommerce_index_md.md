# docs/demo-ecommerce/index.md

## Purpose

Landing page for the demo e-commerce documentation section. Written in plain, non-technical language to explain **what** the pet-supply shop does (browse, buy, ship) without describing **how** it is built. Serves as the single entry point that orients a reader to the four sub-pages before they dive into technical module docs.

## Key elements

- **Purchase-flow Mermaid diagram** — a single left-to-right flowchart (visitor → basket → checkout → set-aside → pay → ship → arrive) colour-coded to distinguish customer actions (blue) from shop actions (amber).
- **Product catalogue table** — lists 6 hand-picked special-case products (normal, out-of-stock, minimal, deleted, switched-off) plus the 126-row generated grid (6 animals × 7 types × 3 tiers) that gives pagination and filters realistic volume.
- **Accounts table** — documents the two usable logins (`ginopinoshow` / `password` for customers, `root` / `rootroot` for staff) and notes the additional 10 customer accounts that exist only as read-only order history for staff views.
- **Delivery & payment table** — three delivery options (Standard €5 / free over €100, Express €15, Pickup €0) and the fake-payment rule (card `4000000000000002` always declines).
- **Navigation table ("Which page do you want")** — maps reader role to the four sub-pages (shopper, manager, warehouse, support).
- **Setup block** — two-line `npm install && npm run demo` command that boots a throwaway, self-seeding database.

## Relationships

- **`docs/demo-ecommerce/shopper.md`** — linked as the "customer experience" detail page; this index introduces the role and then defers to it.
- **`docs/demo-ecommerce/manager.md`** — linked for product/price/order management; this index references it to explain the 130-vs-132 product-visibility difference.
- **`docs/demo-ecommerce/warehouse.md`** — linked for stock and shipping operations.
- **`docs/demo-ecommerce/support.md`** — linked for email, password-reset, and complaint handling.
- **`docs/modules/`** (external) — referenced twice as the "developer" counterpart; this index explicitly states it is *not* that audience.

## Notes

- The page carries a hard convention: **no code on any of the five section pages**. The only code is the two-line `bash` setup snippet and the Mermaid diagram.
- Product counts are asymmetric by design: customers see 130, staff see 132. The deleted and switched-off products are the two that differ; this is not a bug but a documented behaviour explained on the manager page.
- The section describes the **demo instance** (pet-supply), not the underlying boilerplate. The boilerplate is covered separately under `docs/modules/`.
- The demo database is ephemeral — closing the process discards all state; restarting reseeds it identically.
