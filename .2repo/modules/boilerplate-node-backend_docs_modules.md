---
tags:
  - 2repo
  - 2repo/module
  - project/boilerplate-node-backend
type: module
module: docs/modules/
files: 18
updated: 2026-08-31T20:49:36.266084+00:00
---

# docs/modules/

## Purpose

`docs/modules/` is the documentation section for the application's domain modules. Each Markdown file in this directory corresponds to one module (or a tightly related pair of modules) in the source tree, describing its responsibilities, invariants, and boundary so a reader can understand *what* the module does and *why* it is shaped the way it is without opening the code first.

## Key parts

- **Orientation** — `index.md` defines the vertical (domain) vs. horizontal (mechanism) split, renders the module dependency graph, and lists every module grouped by subdomain. Read this before any individual page.
- **Core transaction path** — `cart.md`, `cart-checkout.md`, `orders.md`, `payments.md`, `payments-provider-port.md`, `inventory.md`, `inventory-reservations.md`, `products.md`. These pages document the request→order→payment→stock-release pipeline and the sole-writer invariants around the stock counters.
- **Identity & session** — `account.md` (session lifecycle, address book, two-step deletion) and `account-sessions.md` (token generation, verification, cookie storage, and the `session/` seal-off). Together they explain the kernel's "who is this request?" question.
- **Supporting & leaf domains** — `delivery.md` (shipping rates and shipment state machine), `wishlist.md` (per-user product references), `feedback.md` (open contact form + admin triage), `users.md` (user record shape and repository, distinct from authentication).
- **Cross-cutting / infrastructure** — `observability.md` (health, metrics, SSE, audit read endpoint), `audit-logs.md` (queryable audit trail and its import-time sink), `locales.md` (supported languages and runtime override rows).

## How it connects

- **`docs/`** — This directory is the *modules* sub-section of the top-level documentation root. `docs/index.md` (or equivalent) in the parent links here as the canonical entry point for "how the application is decomposed into modules."
- **`docs/tools/`** — Sibling section that documents developer tooling (CLI commands, scripts, CI utilities). Pages in `docs/modules/` occasionally reference a tool by name (e.g., a migration or seed script) but do not duplicate its documentation; a reader is directed to the corresponding `docs/tools/` page for operational details.

## Where to start

1. **`index.md`** — It is the map: it names every module, draws the dependency graph, and explains the domain/mechanism split in one pass. It tells you which page to open next.
2. **`products.md`** — The simplest leaf module (zero inbound dependencies, clear CRUD shape). Reading it first gives you a concrete sense of the documentation style, the "sole owner" phrasing, and how a module page describes invariants, before moving to the more entangled transaction-path pages.

## Connected modules
```mermaid
flowchart LR
    m_docs_modules["docs/modules/"]
    m_docs["docs/<br/>34 files"]
    m_docs_tools["docs/tools/<br/>40 files"]
    m_docs_modules --- m_docs
    m_docs_modules --- m_docs_tools
    style m_docs_modules stroke-width:3px
```

[[boilerplate-node-backend_docs|docs/]] · [[boilerplate-node-backend_docs_tools|docs/tools/]]

## Files
- `docs/modules/account-sessions.md` — Documents the session subsystem: how access/refresh tokens are generated, verified, and stored in cookies, and why the `session/` folder is deliberately sealed off from all other modules.
- `docs/modules/account.md` — Documents the `account` module, which answers the kernel's "who is making this request?" question. It owns session lifecycle (signup, login, refresh, password reset, logout-everywhere, two-step deletion) and the per-account address book, and it is the repo's only `shared-kernel` consumer.
- `docs/modules/audit-logs.md` — Headless domain module that owns the queryable audit-trail collection and installs its sink at import time. It exists so that audit storage can be toggled as a unit without naming a domain from the assembly file (`app.ts`). No router is declared here; the single read endpoint lives in `observability`.
- `docs/modules/cart-checkout.md` — Documents the `POST /cart/checkout` endpoint — the sole cart operation that writes into another module's collection. It orchestrates a fixed 9-step sequence across five modules to convert a cart into an order, with all validation resolved before any write occurs.
- `docs/modules/cart.md` — Documents the cart module: a per-user collection (one document per `userId`) that holds priced line items against the live catalogue and terminates in a checkout. It is the single point where price, stock, address, shipping, and order creation must all agree atomically.
- `docs/modules/delivery.md` — Documents the delivery module: shipping rates, shipment (parcel) records, and the fake courier that transitions shipments through `shipped → delivered`. Exists to centralize how the shop prices and tracks physical shipping of an order.
- `docs/modules/feedback.md` — Documents the feedback (contact-request) module: an open form anyone can use to file a message by email address, with an admin triage workflow. It exists as a leaf module (no dependencies, no dependents) to give the module system a simple reference point.
- `docs/modules/index.md` — Index and orientation page for the modules documentation section. It defines the vertical (domain) vs. horizontal (mechanism) split of the wiki, renders the module dependency graph, lists every module with a one-line description grouped by subdomain (core / supporting / generic), and documents the frontend–backend module pairing asymmetry. It exists so a reader can pick the right domain page without opening any of them.
- `docs/modules/inventory-reservations.md` — Documents the reservation subsystem inside the inventory module: the four state transitions that move `onHand`/`reserved` counters, the conditional-claim mechanism that guarantees exactly-once semantics without locks or transactions, and the admin sweep that expires stale holds. Exists so readers understand the sole writer path for inventory counters and the invariants that make it safe under concurrency.
- `docs/modules/inventory.md` — Sole owner and writer of the two stock counters (`onHand`, `reserved`) that physically live on the product document, plus the `stockmovements` ledger. Every inventory mutation in the system routes through this module's four transitions; no other code writes those counters.
- `docs/modules/locales.md` — Documents the locales module, which defines which languages this deployment supports and how runtime override rows (one per `locale, scope, key`) patch the bundled translation files. It exists so operators can edit copy without touching source code, while the filesystem remains the source of truth for *which* keys exist.
- `docs/modules/observability.md` — Documents the observability module — the operator-facing HTTP surface (health, metrics overview, live SSE stream, Prometheus scrape endpoint, audit read). This page exists so a reader can understand the module's boundary, its per-route authentication choices, and its deliberate absence of a barrel export without reading the source.
- `docs/modules/orders.md` — Documents the orders module: the aggregate that owns line-item snapshots, the order status state machine, and the semantics of cancellation (unit release + refund). It exists to make the invariants explicit so no other module silently reinterprets them.
- `docs/modules/payments-provider-port.md` — Defines the `PaymentProvider` interface — the single contract the payments service calls for charges and refunds — so that which real provider is wired in is a deployment decision (env variable), not a code path. Shipped with one in-process `fake` implementation; a real PSP plugs in as one additional file.
- `docs/modules/payments.md` — Documents the payments module, which owns an order's money behind a provider port. The intent freezes an order's total; the confirm moves the order to `paid` and commits the inventory hold into a sale. It also handles the refund path triggered by `order.cancelled`.
- `docs/modules/products.md` — Documents the products module, which owns the shop catalogue (product CRUD) and the two stock counters (`onHand`, `reserved`) that live on every product row. It is a leaf module with zero inbound dependencies; four other domains conform to its shape rather than the reverse.
- `docs/modules/users.md` — Documents the `users` module, which owns the user record (email, password hash, admin flag, reset/refresh tokens) and publishes its model and repository. It is a generic, dependency-free leaf at the bottom of the module graph; authentication and the token lifecycle live in the sibling `account` module rather than here.
- `docs/modules/wishlist.md` — Documentation page for the **wishlist** module — the smallest domain in the repo. It defines one wishlist document per user holding product references, with no checkout complexity. The page exists to let readers understand the module's shape, its three one-way dependencies, and its complete independence from the rest of the system.

---
[[boilerplate-node-backend_INDEX|← boilerplate-node-backend index]]
