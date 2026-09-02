---
tags:
  - 2repo
  - 2repo/module
  - project/boilerplate-node-backend
type: module
module: src/modules/inventory/
files: 24
updated: 2026-09-02T18:34:07.061438+00:00
---

# src/modules/inventory/

## Purpose

The inventory module owns every mutation of the `Product.onHand` and `Product.reserved` counters. It manages the full reservation lifecycle (reserve → commit / release / expire), maintains an append-only stock-movement ledger, and exposes a small set of admin-facing HTTP endpoints for stocktake, receipts, and reservation sweeps. Customer-facing availability is *not* a route here; it is derived from the counters and surfaced as a field on the product object.

## Key parts

- **Domain layer** (`domain/transitions.ts`, `domain/index.ts`) — Pure, I/O-free functions that define what each of the six stock-movement transitions does to the two counters and what "available" means to a customer. Exposed through a single barrel that lint enforces as dependency-free.
- **Service** (`service.ts`) — The single application-level chokepoint. Implements reserve/commit/release/expire with conditional writes (no Mongo transactions), the externally-driven expiry sweep, and the guarantee that a counter move and its ledger row are inseparable.
- **Controllers & routes** (`controllers/`, `routes.ts`) — Thin HTTP adapters for five admin endpoints (`/levels`, `/movements`, `/receipts`, `/adjustments`, `/reservations/sweep`). Every route sits behind an admin-only auth chain.
- **Data layer** (`model.ts`, `repository.ts`) — Mongoose schemas for the two inventory-owned collections (StockMovement ledger, Reservation holds) and the domain-specific queries the service needs, built on the shared repository factory.
- **Module wiring** (`module.ts`, `index.ts`, `events.ts`, `audit.ts`, `metrics.ts`, `config.ts`) — Registration manifest, public barrel (the only import surface for sibling modules), the single domain event (`inventory.reservation_expired`), audit-action registration, two Prometheus gauges, and the two deployment knobs (reservation TTL, low-stock threshold).
- **OpenAPI contract** (`openapi.yaml`) — Authoritative REST specification for the five endpoints.
- **Tests** (`tests/`) — Unit tests for the transition table and router surface; integration tests for service semantics against real MongoDB; a property-based ledger-replay test (fast-check + real Mongo); and contract tests that pin every response branch to the OpenAPI spec.

## How it connects

- **Products (`src/modules/products/`)** — The stock counters are columns on the product document. Inventory is the *sole* writer of those counters; the products module owns the document schema and all other fields.
- **Orders (`src/modules/orders/`)** — Orders are the primary lifecycle caller: checkout triggers `reserve`, order completion triggers `commit`, and cancellation triggers `release`/`expire`. Each originating domain audits its own transition; inventory only audits the three admin-initiated actions (receive, adjust, sweep). The `inventory.reservation_expired` event is consumed by orders to clean up the affected order.
- **Payments (`src/modules/payments/`)** — Payment settlement is the external signal that triggers `commit` for a held reservation.
- **Cart (`src/modules/cart/`)** — Cross-module stock checks during cart/checkout are tested in `src/modules/cart/tests/` and depend on the availability verdict exposed by the inventory domain layer.
- **Delivery (`src/modules/delivery/`)** — Shares the same "no internal scheduler" arrangement: an external caller hits `POST /inventory/reservations/sweep` the same way it hits `POST /delivery/advance`.
- **Infrastructure / kernel (`src/infrastructure/`, `src/infrastructure/adapters/`)** — The module registers itself through the kernel's `AppModule` mechanism, augments the kernel's `DomainEventMap` and `AuditActionMap`, and consumes the shared `createRepository` factory and Prometheus gauge registration.
- **Cross-cutting tests (`tests/cross-cutting/`, `tests/support/`)** — Shared test harnesses and fixtures used by the integration and contract suites.

## Where to start

Read `domain/transitions.ts` first — it is the entire mental model in roughly forty lines: six transitions, two counters, one availability rule. Then read `service.ts` to see how those pure rules are wrapped into the conditional-write lifecycle and the sweep loop. Together they explain every other file in the module.

## Connected modules
```mermaid
flowchart LR
    m_src_modules_inventory["src/modules/inventory/"]
    m_root["/ (repository root)<br/>46 files"]
    m_src["src/<br/>22 files"]
    m_src_infrastructure["src/infrastructure/<br/>43 files"]
    m_src_infrastructure_adapters["src/infrastructure/adapters/<br/>15 files"]
    m_src_modules_cart["src/modules/cart/<br/>38 files"]
    m_src_modules_delivery["src/modules/delivery/<br/>20 files"]
    m_src_modules_feedback["src/modules/feedback/<br/>21 files"]
    m_src_modules_orders["src/modules/orders/<br/>26 files"]
    m_src_modules_orders_tests["src/modules/orders/tests/<br/>21 files"]
    m_src_modules_payments["src/modules/payments/<br/>24 files"]
    m_src_modules_products["src/modules/products/<br/>31 files"]
    m_tests_cross_cutting["tests/cross-cutting/<br/>30 files"]
    m_tests_support["tests/support/<br/>21 files"]
    m_src_modules_inventory --- m_root
    m_src_modules_inventory --- m_src
    m_src_modules_inventory --- m_src_infrastructure
    m_src_modules_inventory --- m_src_infrastructure_adapters
    m_src_modules_inventory --- m_src_modules_cart
    m_src_modules_inventory --- m_src_modules_delivery
    m_src_modules_inventory --- m_src_modules_feedback
    m_src_modules_inventory --- m_src_modules_orders
    m_src_modules_inventory --- m_src_modules_orders_tests
    m_src_modules_inventory --- m_src_modules_payments
    m_src_modules_inventory --- m_src_modules_products
    m_src_modules_inventory --- m_tests_cross_cutting
    m_src_modules_inventory --- m_tests_support
    style m_src_modules_inventory stroke-width:3px
```

[[boilerplate-node-backend_ROOT|/ (repository root)]] · [[boilerplate-node-backend_src|src/]] · [[boilerplate-node-backend_src_infrastructure|src/infrastructure/]] · [[boilerplate-node-backend_src_infrastructure_adapters|src/infrastructure/adapters/]] · [[boilerplate-node-backend_src_modules_cart|src/modules/cart/]] · [[boilerplate-node-backend_src_modules_delivery|src/modules/delivery/]] · [[boilerplate-node-backend_src_modules_feedback|src/modules/feedback/]] · [[boilerplate-node-backend_src_modules_orders|src/modules/orders/]] · [[boilerplate-node-backend_src_modules_orders_tests|src/modules/orders/tests/]] · [[boilerplate-node-backend_src_modules_payments|src/modules/payments/]] · [[boilerplate-node-backend_src_modules_products|src/modules/products/]] · [[boilerplate-node-backend_tests_cross-cutting|tests/cross-cutting/]] · [[boilerplate-node-backend_tests_support|tests/support/]]

## Files
- `src/modules/inventory/audit.ts` — Declares the inventory module's audit-action vocabulary and registers it into the app-wide `AuditActionMap` via TypeScript module augmentation. Only three admin-initiated actions are defined here because lifecycle transitions (reserve, commit, release, expire) are audited by the originating domain (checkout, payment, cancellation), each of which leaves its own ledger row.
- `src/modules/inventory/config.ts` — Single source of truth for the two inventory deployment knobs (reservation TTL and low-stock threshold). Exists to eliminate the transcription risk of duplicating a default value across consumers — a problem that actually occurred before this file was extracted. Both values are read per call (not captured at import) so an operator env-var change takes effect on the next request and tests can vary them case-by-case.
- `src/modules/inventory/controllers/get-inventory-levels.ts` — Thin HTTP controller for `GET /inventory/levels`. It validates and parses the query string (including pagination and a boolean filter), then delegates to the inventory service to return a paginated list of stock levels ordered scarcest-first.
- `src/modules/inventory/controllers/get-stock-movements.ts` — Builds the `GET /inventory/movements` list controller, returning a paginated, newest-first page of stock-movement ledger entries that can be narrowed by `productId` and `reason`. It is a thin adapter between the HTTP layer and the inventory service.
- `src/modules/inventory/controllers/post-adjustment.ts` — Controller handler for `POST /inventory/adjustments` — a stocktake correction. This is the module's primary audited endpoint: an unexplained stock correction is indistinguishable from shrinkage, so the handler enforces a non-zero signed delta and a human-written reason before delegating to the inventory service.
- `src/modules/inventory/controllers/post-receipt.ts` — HTTP controller for `POST /inventory/receipts`. Validates the inbound request body, delegates to the inventory service to record a stock receipt, and shapes the HTTP response. Exists as a thin layer between Express routing and domain logic so the service stays transport-agnostic.
- `src/modules/inventory/controllers/post-reservations-sweep.ts` — HTTP handler for `POST /inventory/reservations/sweep`. It triggers the reservation-expiry sweep on demand. The app ships no internal scheduler, so an external caller (cron, CI, operator) invokes this endpoint to tick expirations — the same arrangement as `POST /delivery/advance`. A single audit record is written per sweep run rather than per individual order (each order's own cancellation path records its own audit).
- `src/modules/inventory/domain/index.ts` — Barrel file that defines the public API surface of the inventory **domain layer**. It re-exports two pure functions from `./transitions` so consumers can import domain rules from a single stable path without reaching into implementation files. It also serves as the lint-enforced boundary: anything imported through this path is guaranteed to be free of Express, Mongoose, and application-tier dependencies.
- `src/modules/inventory/domain/transitions.ts` — Pure domain rules for inventory stock counters. Defines what each of the six stock-movement transitions does to a product's `onHand` and `reserved` counters, and provides the single canonical definition of customer-facing availability. No I/O, no status codes, no i18n — data in, verdict out.
- `src/modules/inventory/events.ts` — Declares the single domain event the inventory module emits (`inventory.reservation_expired`) by augmenting the kernel's `DomainEventMap`. It exists to give emitters and listeners a shared, type-safe spelling for the event name and its payload, while avoiding a circular import between `inventory` and `orders`.
- `src/modules/inventory/index.ts` — Public barrel for the Inventory module. It is the **only** import surface allowed for sibling modules (lint forbids reaching `./service` or `./domain` directly). Its job is to expose a minimal, transition-by-name API while keeping repositories, models, and all counter internals private.
- `src/modules/inventory/metrics.ts` — Defines two Prometheus `Gauge` metrics that the inventory module owns: one tracking low-availability product count and one tracking total reserved units. The file is imported purely for its side effect of registering the gauges; no consumer reads the exported (underscore-prefixed) variables.
- `src/modules/inventory/model.ts` — Defines the Mongoose schemas, interfaces, and model instances for the two inventory-owned collections: **StockMovement** (the append-only ledger) and **Reservation** (per-order holds). This module is the sole writer of stock counters on the product document; it stores *deltas* and *claims*, never a stock level itself, so that catalogue reads never require a join.
- `src/modules/inventory/module.ts` — Module manifest and registration entry point for the inventory domain. It wires together the routes, event handlers, and domain gauges into a single `AppModule` descriptor and registers the module with the kernel. The file also carries the authoritative design note: stock counters are columns on the product document, and inventory is the **only** writer of those counters.
- `src/modules/inventory/openapi.yaml` — OpenAPI 3.0.3 contract (v2.0.0) defining the inventory module's REST surface: stock levels, the append-only movement ledger, inbound receipts, stocktake adjustments, and the reservation-sweep tick. It is the single source of truth for what the inventory module exposes and is the only writer of the `Product.onHand` and `Product.reserved` counters.
- `src/modules/inventory/repository.ts` — Defines the data-access layer for the inventory module: an append-only stock-movement ledger and a reservation (hold) collection with lifecycle operations. Each repository is built on the shared `createRepository` factory and the module's Mongoose models, adding only the domain-specific queries the service layer needs.
- `src/modules/inventory/routes.ts` — Defines the Express route table for all staff-facing inventory endpoints. Every route in this module sits behind an admin-only auth gate because the customer-facing half of inventory (how much stock a shopper can buy) is intentionally not exposed as a route at all — it is surfaced as an `available` field on the product object.
- `src/modules/inventory/service.ts` — The single application-level chokepoint for every stock counter change. It implements the reserve → commit / release lifecycle for order holds, guarantees that a counter move and its ledger row are inseparable (via `applyTransition`), and provides the externally-driven expiry sweep. No Mongo transactions are used; atomicity comes from conditional writes in mongod plus the reservation's unique `orderId` for idempotency.
- `src/modules/inventory/tests/contract/api.contract.test.ts` — Contract tests for the `/inventory` HTTP API. Each test pins a specific response branch (status code, body shape, pagination metadata) and validates it against the API spec via `toSatisfyApiSpec()`. The file covers the two read endpoints (`/levels`, `/movements`), two write transitions (`/receipts`, `/adjustments`) with their 200/404/409/422 responses, and the `/reservations/sweep` endpoint. Business-rule assertions on the transitions themselves are delegated to the unit suite.
- `src/modules/inventory/tests/integration/ledger.property.test.ts` — Property-based integration test that verifies a product's stock-movement ledger is a complete and faithful record of its stored counters. Using `fast-check` to generate random sequences of caller-visible operations (receive, adjust, reserve/commit/release/expire), it replays the ledger rows against a **real** MongoDB instance and asserts the sums match the stored `onHand` and `reserved` values exactly. It exists because the correctness guarantee—"a row is written by the same conditional write that moves the counter"—is best proven over an unbounded space of sequences rather than a fixed table of examples.
- `src/modules/inventory/tests/integration/service.test.ts` — Integration tests for the inventory service's own module boundaries: the all-or-nothing `reserveForOrder` semantics, exactly-once `commitForOrder` / `releaseForOrder` transitions, their refusal paths, `receive`, and `adjust` guardrails. Explicitly out of scope (covered elsewhere) are cross-module lifecycle (see `cart/tests/unit/stock.test.ts`) and the ledger replay invariant (see `ledger.property.test.ts`). All tests run against real MongoDB because every guarantee under test is a conditional write.
- `src/modules/inventory/tests/unit/routes.test.ts` — Unit test that locks down the inventory router's surface area: it asserts the exact set and order of mounted endpoints, confirms every route sits behind the full admin guard chain (`getAuth` → `isAuth` → `isAdmin`), and guarantees no unguarded (public) route exists. It exists as a regression tripwire so that accidentally mounting a route above the guard or dropping `isAdmin` would fail CI rather than silently expose stock counters and the ledger.
- `src/modules/inventory/tests/unit/schema-contract.test.ts` — Schema-contract tests for the two inventory collections (`stockMovementSchema` and `reservationSchema`). They assert the *shape* of the MongoDB schemas—required fields, defaults, enums, index specs, and referential types—so that guarantees like exactly-once reservation, replayable deltas, and correct index coverage are enforced by CI rather than discovered in production.
- `src/modules/inventory/tests/unit/transitions.test.ts` — Unit tests for the inventory transition table (`counterDeltaFor`) and the derived `availabilityOf` helper. Rather than restating the table, the tests assert three invariants: (1) only `receive` or `adjust` changes the total unit count, (2) `commit` moves both counters equally so a sale doesn't alter availability, and (3) `release`/`expire` are exact inverses of `reserve`.

---
[[boilerplate-node-backend_INDEX|← boilerplate-node-backend index]]
