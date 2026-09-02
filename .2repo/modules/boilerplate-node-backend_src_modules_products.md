---
tags:
  - 2repo
  - 2repo/module
  - project/boilerplate-node-backend
type: module
module: src/modules/products/
files: 31
updated: 2026-09-02T18:35:33.299506+00:00
---

# src/modules/products/

## Purpose

The products module owns the catalogue entity end-to-end: its Mongoose schema, data-access layer, business-logic service, and the HTTP surface (public read endpoints for the storefront plus admin write endpoints for the back-office). It is a leaf node in the dependency graph—cart, inventory, orders, and wishlist all depend on it, and it communicates downstream solely through domain events rather than direct imports.

## Key parts

- **Entity & data layer** — `model.ts` (Mongoose schema, Zod validation, serialization transform), `repository.ts` (search config, visibility scoping, facet counts, atomic stock-counter transitions), `service.ts` (CRUD orchestration, validation, image-lifecycle side-effects, event/audit/analytics emission).
- **HTTP surface** — `routes.ts` (Express router with auth, rate-limiting, cache, and upload middleware per route) plus the `controllers/` directory: `get-products.ts` (list + search), `get-product-item.ts` (single fetch), `get-catalogue-facets.ts` (category/tag chips), `write-products.ts` (create + update), `delete-products.ts` (remove).
- **Cross-cutting type augmentations** — `analytics.ts`, `audit.ts`, `events.ts` each extend app-wide maps (`AnalyticsEventMap`, `AuditActionMap`, `DomainEventMap`) so the module's vocabulary is typed and discoverable without a central enumeration file.
- **Demo & seed data** — `demo-catalog.ts` (deterministic 126-row combinatorial catalogue), `demo.ts` (full dataset + seed/export ops), `fixtures.ts` (minimal product builder used by both the demo and tests).
- **Module wiring** — `module.ts` (single `AppModule` manifest for the kernel registry), `index.ts` (barrel; the *only* importable surface for sibling modules, enforced by `eslint-plugin-boundaries`).
- **API spec & probes** — `openapi.yaml` (contract for code-gen and validation), `probes.ts` (ad-hoc edge-case requests that complement the generated collection).
- **Tests** — `tests/` split into `unit/` (schema, routes, audit strings, fixtures, i18n messages), `integration/` (repository, service, facets, model serialization, schema contract against real MongoDB), and `contract/` (wire-shape validation against `openapi.yaml`).

## How it connects

- **Downstream consumers (cart, inventory, orders, wishlist):** These modules import only from `src/modules/products/index.ts`. They never reach into `service`, `repository`, or internal paths. Products signals state changes (e.g., stock transitions) via the domain events declared in `events.ts`; downstream modules subscribe to those events rather than calling products' service directly.
- **Infrastructure & adapters (`src/infrastructure/`, `src/infrastructure/adapters/`):** Products relies on the shared `createRepository`, `createItemController`, `createSearchController`, and `createDeleteController` factories, the Mongoose connection, the Zod runtime, and the Express middleware pipeline provided by the infrastructure layer.
- **Scripts (`scripts/`):** `scripts/export-demo-dataset.ts` imports from `demo.ts` to publish `db/demo/demo-data.json`, decoupling the frontend seed from backend source.
- **Cross-cutting tests (`tests/cross-cutting/`, `tests/support/`):** The root-level test harness provides shared MongoDB fixtures, app bootstrap, and assertion helpers that products' integration and contract tests consume.
- **Account / Users (`src/modules/account/`, `src/modules/users/`):** Authentication and caller-scoping middleware (applied in `routes.ts`) depend on these modules to identify whether a request is admin or public, which in turn controls visibility filters in the repository and service.

## Where to start

1. **`module.ts`** — a short manifest that names every route, seed file, locale, and image-writeback the kernel should load, and a one-line note on the module's position in the dependency graph. Reading it first gives you the shape of what "the products module" means to the rest of the app.
2. **`service.ts`** — the single entry point every controller calls into. Walking its public methods (`search`, `getByIdViewed`, `create`, `update`, `remove`) shows how validation, visibility scoping, image side-effects, and event emission fit together before you ever touch the repository or the HTTP layer.

## Connected modules
```mermaid
flowchart LR
    m_src_modules_products["src/modules/products/"]
    m_root["/ (repository root)<br/>46 files"]
    m_scripts["scripts/<br/>25 files"]
    m_src["src/<br/>22 files"]
    m_src_infrastructure["src/infrastructure/<br/>43 files"]
    m_src_infrastructure_adapters["src/infrastructure/adapters/<br/>15 files"]
    m_src_modules_account["src/modules/account/<br/>28 files"]
    m_src_modules_account_tests["src/modules/account/tests/<br/>20 files"]
    m_src_modules_cart["src/modules/cart/<br/>38 files"]
    m_src_modules_delivery["src/modules/delivery/<br/>20 files"]
    m_src_modules_inventory["src/modules/inventory/<br/>24 files"]
    m_src_modules_orders["src/modules/orders/<br/>26 files"]
    m_src_modules_orders_tests["src/modules/orders/tests/<br/>21 files"]
    m_src_modules_payments["src/modules/payments/<br/>24 files"]
    m_src_modules_users["src/modules/users/<br/>31 files"]
    m_src_modules_wishlist["src/modules/wishlist/<br/>21 files"]
    m_src_modules_products --- m_root
    m_src_modules_products --- m_scripts
    m_src_modules_products --- m_src
    m_src_modules_products --- m_src_infrastructure
    m_src_modules_products --- m_src_infrastructure_adapters
    m_src_modules_products --- m_src_modules_account
    m_src_modules_products --- m_src_modules_account_tests
    m_src_modules_products --- m_src_modules_cart
    m_src_modules_products --- m_src_modules_delivery
    m_src_modules_products --- m_src_modules_inventory
    m_src_modules_products --- m_src_modules_orders
    m_src_modules_products --- m_src_modules_orders_tests
    m_src_modules_products --- m_src_modules_payments
    m_src_modules_products --- m_src_modules_users
    m_src_modules_products --- m_src_modules_wishlist
    style m_src_modules_products stroke-width:3px
```

[[boilerplate-node-backend_ROOT|/ (repository root)]] · [[boilerplate-node-backend_scripts|scripts/]] · [[boilerplate-node-backend_src|src/]] · [[boilerplate-node-backend_src_infrastructure|src/infrastructure/]] · [[boilerplate-node-backend_src_infrastructure_adapters|src/infrastructure/adapters/]] · [[boilerplate-node-backend_src_modules_account|src/modules/account/]] · [[boilerplate-node-backend_src_modules_account_tests|src/modules/account/tests/]] · [[boilerplate-node-backend_src_modules_cart|src/modules/cart/]] · [[boilerplate-node-backend_src_modules_delivery|src/modules/delivery/]] · [[boilerplate-node-backend_src_modules_inventory|src/modules/inventory/]] · [[boilerplate-node-backend_src_modules_orders|src/modules/orders/]] · [[boilerplate-node-backend_src_modules_orders_tests|src/modules/orders/tests/]] · [[boilerplate-node-backend_src_modules_payments|src/modules/payments/]] · [[boilerplate-node-backend_src_modules_users|src/modules/users/]] · [[boilerplate-node-backend_src_modules_wishlist|src/modules/wishlist/]] · … and 4 more

## Files
- `src/modules/products/analytics.ts` — Declares the analytics event names for the products module and merges them into the app-wide `AnalyticsEventMap` type via module augmentation. It exists so the products service can emit typed, discoverable funnel events (`products_searched`, `product_viewed`) without hard-coding string literals at call sites.
- `src/modules/products/audit.ts` — Defines the set of audit action strings that the products module emits and registers them into the app-wide `AuditActionMap` via TypeScript module augmentation. Only write operations (create, update, delete) are represented because catalogue reads are public and unauthenticated, so there is no actor to record.
- `src/modules/products/controllers/delete-products.ts` — Thin admin controller for deleting a product by path ID. It delegates all real work to the shared `createDeleteController` factory and the product service, exposing only the wiring (entity name, removal function, audit action, and i18n key).
- `src/modules/products/controllers/get-catalogue-facets.ts` — A thin HTTP controller that exposes the product service's `facets()` method as a `GET /products/categories` endpoint. It translates the service result into the standard success/error response shapes so the storefront can render its category/tag filter chips.
- `src/modules/products/controllers/get-product-item.ts` — Thin HTTP handler for `GET /products/:id`. Wires the shared `createItemController` factory to `productService.getByIdViewed`, passing a caller-scoped visibility filter so that non-admin callers only ever see active products.
- `src/modules/products/controllers/get-products.ts` — Builds the validation schema and cache-key parameter list for the products list/search endpoints, then hands both to the shared `createSearchController` factory to produce the single controller that serves `GET /products` and `POST /products/search`.
- `src/modules/products/controllers/write-products.ts` — Single admin controller handling product creation (POST /products) and update (PUT /products, PUT /products/:id). Both paths share validation, image bookkeeping, and upload-cleanup-on-failure logic, so they are consolidated into one handler that branches on the presence of an `id` in the request body.
- `src/modules/products/demo-catalog.ts` — Generates the full demo product catalogue via deterministic nested-loop combinations (6 animals × 7 product types × 3 tiers = 126 rows). It exists to provide a byte-stable, non-random filler dataset so that `assembleDemoDataset()` and `db:seed` produce identical output on every run — critical for idempotent upserts and reproducible test fixtures. This file deals only in words, prices, and stock counts; it never assigns IDs or images.
- `src/modules/products/demo.ts` — Defines the full product demo dataset (6 named edge-case rows + 126 combinatorial filler rows) and exposes the seed/export operations the CLI and paired frontend consume. It exists as the single source of truth for catalogue fixtures so that `rm -rf src/modules/products` removes the data alongside the module, and so `scripts/export-demo-dataset.ts` can publish `db/demo/demo-data.json` without the frontend needing access to backend source.
- `src/modules/products/events.ts` — Declares the products module's domain events by augmenting the kernel's `DomainEventMap` interface, so the event catalogue grows per-module without a shared enumeration file. Also exports the single event-name constant to keep emitters and listeners in agreement on the spelling.
- `src/modules/products/fixtures.ts` — Builds a single product fixture with only the required `title` and `price` fields placeholdered, leaving all other fields to Mongoose schema defaults. Serves both the demo dataset (`./demo`) and any test that needs a catalogue row, ensuring seeded rows are read back through the real serializer rather than a hand-crafted guess.
- `src/modules/products/index.ts` — Public barrel (entry point) for the products module. It is the **only** surface a sibling module may import from; `eslint-plugin-boundaries` makes reaching internal paths like `@modules/products/service` a lint error. Keeping the surface narrow is a deliberate contract: every re-export here is a promise that the internal implementation can move without breaking consumers.
- `src/modules/products/model.ts` — Defines the Product's Mongoose schema, its Zod validation schema, and the serialization transform that derives the computed `available` field from `onHand` and `reserved`. This is the single source of truth for the Product collection's shape, indexes, and the one-time normalization every product response passes through.
- `src/modules/products/module.ts` — Entry-point manifest for the **products** module. It wires together the module's routes, seed data, locale files, and image writeback into a single `AppModule` object that the kernel registry can discover. It also documents the module's position in the dependency graph: a leaf node that everything else (cart, inventory, orders, wishlist) depends on, communicating downstream via events rather than direct imports.
- `src/modules/products/openapi.yaml` — OpenAPI 3.0.3 specification that defines the full HTTP contract for the products module: CRUD operations on products, a public catalogue-facets endpoint, and the request/response schemas that bind them. It serves as the single source of truth for client code-generation, validation, and documentation of the products API surface.
- `src/modules/products/probes.ts` — Holds the products module's ad-hoc probe requests — edge-case scenarios that the OpenAPI contract cannot express on its own (validation failures, `Accept-Language` diffs, optional-filter combinations, and visibility-branch fixtures). It complements the generated collection rather than replacing it.
- `src/modules/products/repository.ts` — The catalogue's data-access layer. It wraps the shared `createRepository` factory with product-specific search config, public-visibility scoping, facet counting, and the atomic counter transitions (`onHand` / `reserved`) that back the inventory module. It is the single write-path for stock counters and the read-path for the public product API.
- `src/modules/products/routes.ts` — Defines the Express router for the product catalogue. It wires public read endpoints (list, search, single item, facets) and admin-only write endpoints (create, update, delete) into a single router, applying authentication, rate-limiting, cache, and file-upload middleware in the correct per-route order.
- `src/modules/products/service.ts` — The product service layer: all business logic for the catalogue entity. It is the single entry point controllers call into, sitting between HTTP handlers and the repository. It owns validation, search/read access control, CRUD orchestration, image-lifecycle side-effects, and the emission of analytics/audit/domain events.
- `src/modules/products/tests/contract/api.contract.test.ts` — Contract tests for the `/products` REST surface. Every assertion calls `toSatisfyApiSpec()` to validate the wire response shape against `openapi.yaml` (including `additionalProperties: false`), and a smaller set of behavioural assertions verify that filter-scoping and delete-semantics invariants hold regardless of how the backend implements them.
- `src/modules/products/tests/fixtures.ts` — Provides the database-persisting product fixture for tests. It is a thin wrapper around the pure builder `makeProduct` (defined in `../fixtures.ts`) that actually writes a document to the test database via `productRepository.create`, returning the populated Mongoose document. It exists so that integration and contract tests across modules can seed a product with a single call rather than managing repository plumbing inline.
- `src/modules/products/tests/integration/facets.test.ts` — Integration tests for `productRepository.facets()`, the query behind the storefront's filter chips. The suite verifies that facet counts, visibility filtering, sort order, and empty-state behavior all match the contract the UI depends on.
- `src/modules/products/tests/integration/model.test.ts` — Integration test that verifies the serialization invariant: product responses must never expose Mongoose's `_id` or `__v` fields, regardless of whether the data path goes through a hydrated document (`toJSON`) or a `.lean()` query (plain-object list). It exists to guard against a regression where either path leaks internal MongoDB fields to the API consumer.
- `src/modules/products/tests/integration/repository.test.ts` — Integration test suite for `productRepository` executed against a real MongoDB instance. It verifies CRUD operations, pagination, lean-output guarantees, and the three aggregate reads (`facets`, `sumReserved`, `availabilityPage`)—with dedicated blocks that pin their behavior over an empty catalogue and that distinguish the two intentionally different stock gauges (`countLowAvailability` vs. `sumReserved`).
- `src/modules/products/tests/integration/schema-contract.test.ts` — Integration test that validates the Mongoose schema declarations themselves — `required`, `default`, `select: false`, serialization options — against a real MongoDB instance. It exists because these behaviours belong to Mongoose, not to application code; mocking the model would assert the mock's interpretation rather than the actual schema contract.
- `src/modules/products/tests/integration/service.test.ts` — Integration test suite for `productService`, exercising validation (`validateData`), caller-scoped visibility (`search` / `getById`), and the create/update/remove flows against a real test database. It verifies business rules that depend on the full module graph (inventory, cart, delivery, etc.) rather than isolated unit behavior.
- `src/modules/products/tests/unit/audit.test.ts` — Locks in the exact string values of the `productsAuditActions` vocabulary so that accidental renames, additions, or removals are caught immediately. The values are a wire contract consumed by external log queries and alerting tooling, not just internal constants.
- `src/modules/products/tests/unit/fixtures.test.ts` — Unit tests for the `makeProduct` fixture builder. This test suite is critical because `makeProduct` is **not test-only**: it seeds the shipped demo dataset via `demo.ts` and `scripts/export-demo-dataset.ts` (published as `db/demo/demo-data.json`). A defect here propagates into a published artifact, not just a test run.
- `src/modules/products/tests/unit/routes.test.ts` — Route-table contract test for the product catalogue router. It asserts the full set of mounted endpoints, their order, middleware chains, cache configuration, upload handling, and flag-gating — catching silent regressions (dropped guards, path shadowing, cache-tag drift, ignored upload fields) that TypeScript's type system cannot express.
- `src/modules/products/tests/unit/schema-contract.test.ts` — Contract tests that pin down the product schema's defaults, constraints, and index declarations, and verify the `available` derivation performed by `applyProductTransform`. The tests exist to document *why* each default is what it is (sellable-by-default, empty-vs-absent arrays, no soft-delete default) so that schema changes break loudly rather than silently altering storefront behaviour.
- `src/modules/products/tests/unit/validation-messages.test.ts` — Unit test that verifies the product catalogue's Zod schema emits **locale-specific** validation messages (Italian) rather than Zod's built-in English defaults. It guards the i18n wiring between the schema in `@modules/products/model` and the product translation namespace.

---
[[boilerplate-node-backend_INDEX|← boilerplate-node-backend index]]
