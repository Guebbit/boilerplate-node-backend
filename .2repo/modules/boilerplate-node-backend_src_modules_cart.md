---
tags:
  - 2repo
  - 2repo/module
  - project/boilerplate-node-backend
type: module
module: src/modules/cart/
files: 38
updated: 2026-09-02T18:33:18.776611+00:00
---

# src/modules/cart/

## Purpose

The cart module owns the full per-user shopping-cart lifecycle: adding, updating, and removing line items; evaluating checkout eligibility; executing checkout (stock reservation, order creation); and re-ordering from a past order. It enforces a strict layering—thin HTTP controllers, a service layer for business rules, pure domain logic, and a Mongo-backed repository—so that no transport concern leaks into decisions and no domain rule leaks into transport.

## Key parts

- **Domain rules** (`domain/`) — Pure, side-effect-free checkout-eligibility logic (`rules.ts`) that returns a typed pass/refusal verdict. No Express, no DB, no i18n.
- **Service layer** (`services/`) — The operational core, split into focused files: `items.ts` (line CRUD), `checkout.ts` (order creation + stock reservation), `reorder.ts` (copy an order back into the cart), `cleanup.ts` (cross-module deletion hooks), and `view.ts` (shared join/serialization). `index.ts` assembles them into the single `cartService` namespace.
- **Controllers & routes** (`controllers/`, `routes.ts`) — Thin Express adapters that translate HTTP ↔ service calls. `routes.ts` declares the route table, auth guards, mount-order contract (static before parameterised), and checkout's re-auth + cache-invalidation requirements.
- **Data layer** (`model.ts`, `repository.ts`) — Mongoose schema for the per-user cart document (one document per `userId`, with a TTL index) and the six domain-specific Mongo writes (upsert, remove, clear, two cleanup variants).
- **Module wiring & contracts** (`module.ts`, `index.ts`, `openapi.yaml`, `probes.ts`) — The manifest that registers routes, events, and demo seeding into the app kernel; the public barrel that exposes *only* `cartService` to sibling modules; the OpenAPI 3.0.3 spec; and the runnable probe collection for negative-path scenarios.
- **Cross-cutting registrations** (`analytics.ts`, `audit.ts`, `metrics.ts`) — Co-locate cart event names, audit action names, and the Prometheus checkout-outcome counter with the module that emits them, registering into app-wide maps via TS module augmentation.
- **Demo & fixtures** (`demo.ts`, `fixtures.ts`) — Seeded cart data for the demo environment and a stable-ID factory consumed by `scripts/export-demo-dataset.ts`.
- **Tests** (`tests/`) — Unit tests (domain rules, schema shape, fixtures, retention TTL, route invariants, audit strings), integration tests (service writes, stock reservation lifecycle, Mongo index enforcement), and contract tests (all six endpoints validated against the OpenAPI spec).

## How it connects

- **orders** — `checkout.ts` is the only cart service that writes into the orders collection; `reorder.ts` reads an order to copy its lines back into the cart. The dependency direction is strictly `cart → orders`.
- **products** — Cart lines are joined with product data for pricing (`view.ts`, `items.ts`); `cleanup.ts` removes cart lines when a product is permanently deleted; `routes.ts` invalidates the products response cache at checkout.
- **inventory** — Checkout reserves stock against the cart; domain rules evaluate reservation-aware availability, cross-checked against the inventory module's `availabilityOf`.
- **users** — `cleanup.ts` exposes the entry point that clears a user's cart when the account is deleted.
- **infrastructure** — `analytics.ts` and `audit.ts` register names into the infrastructure's app-wide event and audit maps; `metrics.ts` exposes a counter readable by the infrastructure's Prometheus overview endpoint without a direct import.
- **account** — The metrics file explicitly follows the structural pattern established in `modules/account/metrics.ts` (counter co-located in the domain module).
- **wishlist** — Schema-level distinction: a cart line carries `quantity`; a wishlist line does not (asserted in `tests/unit/schema-contract.test.ts`).
- **scripts / tests** — `fixtures.ts` produces stable IDs so `scripts/export-demo-dataset.ts` can hash-compare without churn; `tests/cross-cutting/` exercises cart alongside other modules in shared scenarios.

## Where to start

1. **`services/index.ts`** — Read this first to see the full surface of `cartService` (every exported operation in one place) and understand the module's public contract.
2. **`domain/rules.ts`** — Short, pure, and dependency-free. It captures the single most important business rule (can this cart check out?) in a few dozen lines, and reading it immediately clarifies the boundary between domain logic and the service/transport layers that wrap it.

## Connected modules
```mermaid
flowchart LR
    m_src_modules_cart["src/modules/cart/"]
    m_root["/ (repository root)<br/>46 files"]
    m_scripts["scripts/<br/>25 files"]
    m_src["src/<br/>22 files"]
    m_src_infrastructure["src/infrastructure/<br/>43 files"]
    m_src_infrastructure_adapters["src/infrastructure/adapters/<br/>15 files"]
    m_src_modules["src/modules/<br/>20 files"]
    m_src_modules_account["src/modules/account/<br/>28 files"]
    m_src_modules_account_tests["src/modules/account/tests/<br/>20 files"]
    m_src_modules_delivery["src/modules/delivery/<br/>20 files"]
    m_src_modules_inventory["src/modules/inventory/<br/>24 files"]
    m_src_modules_orders["src/modules/orders/<br/>26 files"]
    m_src_modules_orders_tests["src/modules/orders/tests/<br/>21 files"]
    m_src_modules_payments["src/modules/payments/<br/>24 files"]
    m_src_modules_products["src/modules/products/<br/>31 files"]
    m_src_modules_users["src/modules/users/<br/>31 files"]
    m_src_modules_cart --- m_root
    m_src_modules_cart --- m_scripts
    m_src_modules_cart --- m_src
    m_src_modules_cart --- m_src_infrastructure
    m_src_modules_cart --- m_src_infrastructure_adapters
    m_src_modules_cart --- m_src_modules
    m_src_modules_cart --- m_src_modules_account
    m_src_modules_cart --- m_src_modules_account_tests
    m_src_modules_cart --- m_src_modules_delivery
    m_src_modules_cart --- m_src_modules_inventory
    m_src_modules_cart --- m_src_modules_orders
    m_src_modules_cart --- m_src_modules_orders_tests
    m_src_modules_cart --- m_src_modules_payments
    m_src_modules_cart --- m_src_modules_products
    m_src_modules_cart --- m_src_modules_users
    style m_src_modules_cart stroke-width:3px
```

[[boilerplate-node-backend_ROOT|/ (repository root)]] · [[boilerplate-node-backend_scripts|scripts/]] · [[boilerplate-node-backend_src|src/]] · [[boilerplate-node-backend_src_infrastructure|src/infrastructure/]] · [[boilerplate-node-backend_src_infrastructure_adapters|src/infrastructure/adapters/]] · [[boilerplate-node-backend_src_modules|src/modules/]] · [[boilerplate-node-backend_src_modules_account|src/modules/account/]] · [[boilerplate-node-backend_src_modules_account_tests|src/modules/account/tests/]] · [[boilerplate-node-backend_src_modules_delivery|src/modules/delivery/]] · [[boilerplate-node-backend_src_modules_inventory|src/modules/inventory/]] · [[boilerplate-node-backend_src_modules_orders|src/modules/orders/]] · [[boilerplate-node-backend_src_modules_orders_tests|src/modules/orders/tests/]] · [[boilerplate-node-backend_src_modules_payments|src/modules/payments/]] · [[boilerplate-node-backend_src_modules_products|src/modules/products/]] · [[boilerplate-node-backend_src_modules_users|src/modules/users/]] · … and 5 more

## Files
- `src/modules/cart/analytics.ts` — Declares the catalogue of analytics event names that the cart module emits and registers them into the analytics port's app-wide `AnalyticsEventMap` union. It exists so that every cart-related event name is co-located with the module that fires it, following the rule that "a name belongs to the code that emits it."
- `src/modules/cart/audit.ts` — Declares the cart module's audit action names and registers them into the app-wide `AuditActionMap` via TypeScript module augmentation. It exists so that cart-specific audit events have a single, typed source of truth without polluting a shared enum.
- `src/modules/cart/controllers/delete-cart-all.ts` — Thin HTTP adapter that maps `DELETE /cart/all` to `cartService.cartRemove`. It exists as a dedicated, bodyless destructive endpoint so that "clear everything" must be explicitly requested by URL rather than inferred from a missing body on `DELETE /cart` (a pattern that previously allowed a stripped body to silently wipe the cart).
- `src/modules/cart/controllers/delete-cart-item.ts` — Thin HTTP adapter that exposes `DELETE /cart/:productId` (canonical) and `DELETE /cart` (alias) by delegating to `cartService.cartItemRemoveById`. It normalises the two input shapes into a single `productId` string, validates it, and translates the service result into an HTTP response.
- `src/modules/cart/controllers/get-cart-summary.ts` — Thin HTTP adapter for `GET /cart/summary`. Translates an incoming Express request into a call to the cart service's badge-summary method and sends back the summary object. Exists so the route layer never touches business logic directly.
- `src/modules/cart/controllers/get-cart.ts` — Thin HTTP adapter that handles the `GET /cart` endpoint by delegating to the cart service layer and formatting the result into an HTTP response. It exists to keep transport concerns (Express request/response, auth extraction, error catching) separate from business logic.
- `src/modules/cart/controllers/post-cart.ts` — Thin HTTP adapter for `POST /cart`. Parses and validates the request, then delegates all business logic (eligibility, upsert semantics) to `cartService.cartItemAdd`. Exists to keep the Express layer free of domain rules.
- `src/modules/cart/controllers/post-checkout.ts` — Thin HTTP adapter for `POST /cart/checkout`. Extracts the authenticated user and optional body fields, delegates to `cartService.orderConfirm`, maps the result to a 201 or a refused response, and records the `cart_checkout_total` metric on every code path (success, business-refusal, and thrown error).
- `src/modules/cart/controllers/post-reorder.ts` — Thin HTTP adapter for `POST /cart/reorder/:orderId`. It extracts the authenticated user and target order from the request, delegates all business logic to `cartService.reorderIntoCart`, and translates the service result into an Express response (200 or 409). No domain logic lives here.
- `src/modules/cart/controllers/put-cart-item.ts` — Thin HTTP adapter for `PUT /cart/:productId`. Validates the incoming request, extracts the user and product identifiers, and delegates all business logic to `cartService.cartItemUpdateQuantity`. It exists solely to translate between Express's request/response lifecycle and the cart service's domain API.
- `src/modules/cart/demo.ts` — Declares the cart's share of the demo dataset: which seeded users get a cart row, what items are in each cart, and the functions to upsert and read those rows back. It lives here (the cart module) rather than nested under each user so the cart collection is owned and stated where it belongs.
- `src/modules/cart/domain/index.ts` — Barrel entry point for the cart **domain layer**. It exists to give consumers a single stable import path while re-exporting the pure, framework-free rules defined in `rules.ts`. No logic lives here.
- `src/modules/cart/domain/rules.ts` — Pure decision logic that determines whether a cart can proceed to checkout. It accepts already-joined cart lines and returns a typed verdict (pass / named refusal reason), with no side effects, no status codes, and no i18n — those concerns belong to the service layer.
- `src/modules/cart/fixtures.ts` — Factory for building cart fixtures that are safe to pass to `cartRepository.create`. It pins a stable `_id` (via `identityOf`) so that `scripts/export-demo-dataset.ts` can hash-compare the committed `demo-data.json` without the artefact going stale on every run, and it converts string ids to `ObjectId` instances so Mongo lookups actually match.
- `src/modules/cart/index.ts` — Public barrel file for the cart module. It is the **only** import surface available to sibling modules, re-exporting a single symbol (`cartService`) to enforce the rule that cross-module access must go through the service layer.
- `src/modules/cart/metrics.ts` — Owns the Prometheus counter(s) for the cart domain—specifically checkout attempt outcomes. Following the pattern established in `modules/account/metrics.ts`, the counter lives in the domain module (not in `infrastructure`) so that the overview endpoint can read its value without a direct import into this file.
- `src/modules/cart/model.ts` — Defines the Mongoose schema, model, and TypeScript interfaces for the per-user cart document. The cart is stored in Mongo as a durable record (Redis is cache-only here), with field names matching the `CartItem` shape in `openapi.yaml` so stored and wire representations are identical.
- `src/modules/cart/module.ts` — The manifest (registration entry) for the shopping-cart module. It wires the cart's routes, domain-event subscriptions, demo seeding, and locale directory into the application's module registry so the kernel can mount, seed, and subscribe to the cart as a first-class feature.
- `src/modules/cart/openapi.yaml` — OpenAPI 3.0.3 contract for the **cart** module (v2.0.0). It defines every endpoint a client can call to inspect, mutate, and consume a per-user shopping cart, including checkout and reorder flows. Serves as the single source of truth for request/response shapes, error semantics, and endpoint aliases within the cart domain.
- `src/modules/cart/probes.ts` — Provides the cart module's probe collection—concrete API requests that exercise failure paths and boundary conditions the OpenAPI contract cannot express on its own (e.g., "send this body, expect this refusal"). It exists so the runnable-collections runner has cart-specific negative-path scenarios to execute.
- `src/modules/cart/repository.ts` — Cart repository that extends the shared repository factory with the six domain-specific writes a cart requires: line upsert, line removal, cart clearing (plain and version-guarded), and the two cleanup writes owed to product/user deletion. All writes are keyed by `userId` alone, since the schema's `unique: true` constraint makes that a complete document address.
- `src/modules/cart/routes.ts` — Defines the Express route table for the cart domain. Every route is behind authentication, and `POST /checkout` additionally demands a fresh (re-authenticated) session and invalidates the `orders` and `products` response caches. The file also encodes a mount-order contract: static segments (`/summary`, `/all`) must be registered before the parameterised `/:productId` routes so Express does not swallow them as product IDs.
- `src/modules/cart/services/checkout.ts` — Implements the checkout operation: resolves the caller's cart into a concrete order, reserves stock against it, and conditionally clears the cart. It is the only cart service that writes into another module's collection (orders) and the only one where a lost race can cost a customer money, so the concurrency model is explicit and documented inline.
- `src/modules/cart/services/cleanup.ts` — Provides two cross-module cleanup entry points that remove cart references when a user or product is permanently deleted elsewhere in the system. Neither function is reachable from a cart route; they exist as the only callers that tidy up cart data after the owning entity disappears.
- `src/modules/cart/services/index.ts` — Barrel file for the cart service layer. Re-exports the individual cart operations (read, write, checkout, reorder, cleanup) so that controllers and cross-module callers have a single import path. Also assembles all of them into the `cartService` namespace object, which is the canonical entry point for callers. The cart service lives in a folder rather than one file because it exceeded the ~300-line threshold defined in `docs/theory/layers.md`.
- `src/modules/cart/services/items.ts` — Service layer for reading and mutating cart lines. Every exported operation performs a single write (or read) against `cartRepository` and then joins the result with product data to produce a priced `CartView`. Single-product mutations carry a `ResponseSuccess | ResponseReject` envelope; `cartRemove` and the badge/view reads do not, because they cannot fail.
- `src/modules/cart/services/reorder.ts` — Copies a past order's line items back into the caller's cart. It lives in the **cart** module (not orders) because the write target is the cart; the order is only read. This keeps the `cart → orders` dependency direction that the module manifests declare and avoids the cycle an `/orders/{id}/reorder` route would require.
- `src/modules/cart/services/view.ts` — Read/projection layer for the cart: turns a stored `CartDocument` into the shapes callers actually consume — joined lines (`CartLine`) and the API response (`CartView`). Lives in `services/` and is shared by the sibling service files (`checkout`, `items`, `reorder`) so none of them duplicates join or serialization logic.
- `src/modules/cart/tests/contract/api.contract.test.ts` — Contract tests for all six `/cart` endpoints. Every route returns the same `CartResponseEnvelope` shape, making serialization drift easy to hide; these tests assert each response (success and error) against the OpenAPI spec via `toSatisfyApiSpec()`. Cart state is built through real API calls rather than a fixture builder because `CartResponse` is a computed view, not a direct serialization of a stored document.
- `src/modules/cart/tests/integration/schema-contract.test.ts` — Integration test that verifies Mongoose schema-level declarations (here, the unique index on `userId`) against a **real** MongoDB instance. It exists because schema constraints are part of the public API contract and aren't exercised by the sibling transform/behaviour specs; mocking would assert the mock's own behaviour rather than Mongoose's index enforcement.
- `src/modules/cart/tests/integration/service.test.ts` — Integration test suite for the cart service layer, running against a real MongoDB instance (`setupTestDb`). It exists to pin the highest-risk seam in the module — the shared `upsertCartItem` path behind both `set` and `add`, where a collapsed `$set`/`$inc` distinction would silently corrupt a user's quantity — and to guard the serialization contract (no extra keys on `CartItem`, no per-line `_id`) that a mock cannot exercise because the behaviour lives inside the repository's guarded writes.
- `src/modules/cart/tests/integration/stock.test.ts` — Integration test suite verifying the reservation model across the full order lifecycle. The core invariant under test: units are *reserved* at checkout (neither sold nor free) and only leave `onHand` upon payment; they are recoverable via cancellation or TTL expiry. Every assertion checks `onHand` and `reserved` together to catch a shop that merely decrements stock. Runs against real MongoDB because the guarantees depend on conditional writes that mocks cannot exercise.
- `src/modules/cart/tests/unit/audit.test.ts` — Pinning test for the `cartAuditActions` wire-contract strings emitted by the cart module. It asserts exact string values and the complete key set so that silent renames, additions, or removals of audit action identifiers are caught in CI before they break downstream log queries and alert rules.
- `src/modules/cart/tests/unit/domain-rules.test.ts` — Unit tests for `evaluateCheckout` — the pure, dependency-free rule that decides whether a cart's lines can proceed to checkout. Covers empty-cart rejection, product-resolution failure, reservation-aware stock sufficiency, fail-closed handling of missing counters, and the priority order of failure reasons. Also cross-checks that the cart domain's internal availability arithmetic agrees with the inventory module's `availabilityOf`.
- `src/modules/cart/tests/unit/fixtures.test.ts` — Unit tests for the `makeCart` fixture builder. They verify that the fixture performs its one critical job—converting string product/user IDs into real Mongoose `ObjectId` instances—so that seeded carts actually match catalogue lookups instead of silently appearing empty.
- `src/modules/cart/tests/unit/retention.test.ts` — Verifies that the cart collection's TTL index is declared with the expected `expireAfterSeconds` value, both for the default (365 days) and for an operator-configured `NODE_CART_RETENTION_DAYS`. Because the model reads that env var **once at import time**, the test re-imports the model under a reset Jest module registry to exercise the read again.
- `src/modules/cart/tests/unit/routes.test.ts` — Unit test for the cart router that pins down three invariants: the exact set and declaration order of endpoints, the authorization posture (authenticated, never admin), and the caching policy (invalidate at checkout, never set a shared cache). It exists so that accidental reordering, guard changes, or cache additions break the build immediately.
- `src/modules/cart/tests/unit/schema-contract.test.ts` — Contract test for the Mongoose `cartSchema`. It asserts the schema's shape, indexes, defaults, and sub-document structure at the feature boundary, and encodes the one distinguishing fact between cart and wishlist: a cart line carries a `quantity` field while a wishlist line does not.

---
[[boilerplate-node-backend_INDEX|← boilerplate-node-backend index]]
