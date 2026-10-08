---
tags:
  - 2brain
  - 2brain/module
  - project/boilerplate-node-backend
type: module
module: src/modules/products/
files: 57
updated: 2026-10-08T00:00:28.851675+00:00
---

# src/modules/products/

## Purpose

The products module owns the shop's product catalogue: the product entity (schema, validation, tax-class resolution, availability derivation), the HTTP API that exposes it (public storefront reads and admin/supplier writes), and the persistence layer behind it. It is a **leaf / aggregate-root module** in the domain—other contexts (cart, orders, inventory) conform to its contracts rather than the reverse, and it communicates outward exclusively through domain events and the derived-write ports exposed by its repository.

## Key parts

- **`model.ts`** — Mongoose schema, Zod request-validation schemas, and the `ProductRecord` / `ProductSnapshot` type split. The single source of truth for what a product document looks like.
- **`module.ts`** — Kernel manifest: declares routes, permissions, config gates, translatable fields, image targets, and test scenarios so the application can discover the module without importing its internals.
- **`routes.ts` + `controllers/`** — Express router that wires every endpoint and attaches cross-cutting middleware (auth, permissions, caching, rate-limiting, image uploads). Controllers are thin shells over shared factories (`createSearchController`, `createItemController`, `createUpdateController`, etc.) and delegate all logic to the service layer.
- **`services/`** — Business logic split by concern: CRUD reads/writes, search & facets, validation, lookups, stock-view, translated-field writes, image handling, and delete/restore orchestration.
- **`repository.ts`** — Persistence layer built on the shared `createRepository`. Adds caller-scoped visibility filtering, a facet aggregate, and three "derived-write" ports (stock cache, translated fields, image digest) that sibling modules call to mirror already-decided state onto a product document.
- **`domain/stock.ts`** — Pure function that derives a customer-facing "available to buy" count from the `onHand` / `reserved` counters written by `@modules/inventory`.
- **`tax.ts` + `config.ts`** — Resolves a product's `taxClass` to a concrete VAT rate; rates and currency are read from environment variables per call so changes take effect without a restart.
- **`events.ts` / `analytics.ts` / `audit.ts`** — Type-level extensions (declaration merging) that register the module's domain events, analytics event names, and audit-action vocabulary into shared kernel maps without modifying the observability layer.
- **`openapi.yaml`** — OpenAPI 3.0.3 contract for the full HTTP surface; the single source of truth for codegen and client typing.
- **`index.ts`** — The only public barrel a sibling module may import from; curates the external API while keeping the repository, schema, and transform functions internal.
- **`factories.ts` / `tests/`** — Test fixture builders and contract/integration suites that assert wire-shape conformance to `openapi.yaml` and exercise visibility, pagination, and audit semantics.

## How it connects

- **`src/infrastructure/`** — Supplies the generic building blocks the module composes: `createRepository`, the shared controller factories (`createItemController`, `createSearchController`, `createDeleteController`, `createRestoreController`, `createUpdateController`), and the HTTP/adapter layer that `routes.ts` mounts onto.
- **`src/modules/inventory/`** — Writes `onHand` and `reserved` counters onto product documents via the repository's derived-write port. The products module in turn derives `available` from those counters (`domain/stock.ts`) so availability never drifts.
- **`src/modules/orders/`** — Calls `tax.ts` to freeze the VAT rate at order-creation time; the products module owns the "every product resolves to a rate" invariant, orders simply record the result.
- **`src/modules/cart/` / `src/modules/wishlist/`** — Read product availability and price through the public catalogue endpoints or the repository's read paths; they never mutate product state.
- **`src/modules/locales/`** — The products module's translatable fields (declared in `module.ts`) are managed by the locales module; the `translated-write` service port keeps language rows in sync.
- **`src/modules/users/` / `src/modules/account/`** — Provide the authentication and permission tokens that `routes.ts` evaluates to enforce admin-only writes vs. public reads.
- **`scenarios/`** — Referenced by `module.ts` as the shop-scenario catalogue; the products `factories.ts` seeds rows that scenario-based tests consume.
- **`src/modules/notifications/`** — Consumes the domain events declared in `events.ts` (e.g. product created/deleted) to trigger outbound notifications.

## Where to start

1. **`model.ts`** — Read this first to understand the product document shape, the Zod validation boundaries, and the `ProductRecord` vs. `ProductSnapshot` distinction. Nearly every other file in the module reasons about this structure.
2. **`module.ts`** — Second, to see the module's full registration surface (routes, permissions, config, scenarios) and confirm the leaf-module boundary. Together these two files give you the "what" and "where" before you trace any request path through `routes.ts` → `controllers/` → `services/`.

## Connected modules
```mermaid
flowchart LR
    m_src_modules_products["src/modules/products/"]
    m_scenarios["scenarios/<br/>42 files"]
    m_src["src/<br/>34 files"]
    m_src_infrastructure["src/infrastructure/<br/>67 files"]
    m_src_infrastructure_adapters["src/infrastructure/adapters/<br/>32 files"]
    m_src_infrastructure_http["src/infrastructure/http/<br/>29 files"]
    m_src_modules_account["src/modules/account/<br/>107 files"]
    m_src_modules_addresses["src/modules/addresses/<br/>24 files"]
    m_src_modules_cart["src/modules/cart/<br/>56 files"]
    m_src_modules_delivery["src/modules/delivery/<br/>27 files"]
    m_src_modules_inventory["src/modules/inventory/<br/>37 files"]
    m_src_modules_invoicing["src/modules/invoicing/<br/>33 files"]
    m_src_modules_locales["src/modules/locales/<br/>44 files"]
    m_src_modules_notifications["src/modules/notifications/<br/>25 files"]
    m_src_modules_orders["src/modules/orders/<br/>91 files"]
    m_src_modules_payments["src/modules/payments/<br/>60 files"]
    m_src_modules_products --- m_scenarios
    m_src_modules_products --- m_src
    m_src_modules_products --- m_src_infrastructure
    m_src_modules_products --- m_src_infrastructure_adapters
    m_src_modules_products --- m_src_infrastructure_http
    m_src_modules_products --- m_src_modules_account
    m_src_modules_products --- m_src_modules_addresses
    m_src_modules_products --- m_src_modules_cart
    m_src_modules_products --- m_src_modules_delivery
    m_src_modules_products --- m_src_modules_inventory
    m_src_modules_products --- m_src_modules_invoicing
    m_src_modules_products --- m_src_modules_locales
    m_src_modules_products --- m_src_modules_notifications
    m_src_modules_products --- m_src_modules_orders
    m_src_modules_products --- m_src_modules_payments
    style m_src_modules_products stroke-width:3px
```

[[boilerplate-node-backend_ROOT|/ (repository root)]] · [[boilerplate-node-backend_scenarios|scenarios/]] · [[boilerplate-node-backend_src|src/]] · [[boilerplate-node-backend_src_infrastructure|src/infrastructure/]] · [[boilerplate-node-backend_src_infrastructure_adapters|src/infrastructure/adapters/]] · [[boilerplate-node-backend_src_infrastructure_http|src/infrastructure/http/]] · [[boilerplate-node-backend_src_modules_account|src/modules/account/]] · [[boilerplate-node-backend_src_modules_addresses|src/modules/addresses/]] · [[boilerplate-node-backend_src_modules_cart|src/modules/cart/]] · [[boilerplate-node-backend_src_modules_delivery|src/modules/delivery/]] · [[boilerplate-node-backend_src_modules_inventory|src/modules/inventory/]] · [[boilerplate-node-backend_src_modules_invoicing|src/modules/invoicing/]] · [[boilerplate-node-backend_src_modules_locales|src/modules/locales/]] · [[boilerplate-node-backend_src_modules_notifications|src/modules/notifications/]] · [[boilerplate-node-backend_src_modules_orders|src/modules/orders/]] · … and 4 more

## Files
- `src/modules/products/analytics.ts` — Declares the analytics event names emitted by the products module and registers them into the shared analytics port's type map. It is a type-level extension (plus a small const object) that lets the products module fire typed discovery events—product search and product view—without modifying the observability layer directly.
- `src/modules/products/audit.ts` — Declares the audit-action vocabulary for the products module and registers it into the app-wide `AuditActionMap` via TypeScript declaration merging. Only write operations (create, update, delete, restore) are audited; catalogue reads are public and unauthenticated, so there is no actor to record.
- `src/modules/products/config.ts` — Defines the two VAT rates (default and reduced) and the deployment's single currency code for the products module. All values are read per call via environment variables rather than captured at import, so a rate change takes effect on the next resolve without a restart. This file owns those reads because `products/tax.ts` is the sole consumer of a product's tax class → rate mapping.
- `src/modules/products/controllers/create-product.ts` — Admin "create product" HTTP controller for the catalogue. Decodes the typed request body (JSON or multipart) and the image upload, then delegates to `productService.writeCreate` so that the product and all its language translations are validated and persisted in a single atomic operation.
- `src/modules/products/controllers/delete-products.ts` — Admin-facing delete endpoint for the product catalogue. It is a thin, one-line wiring of the shared `createDeleteController` factory to the product domain, delegating all delete logic to the service layer so the controller itself contains no business logic.
- `src/modules/products/controllers/get-catalogue-facets.ts` — Thin Express controller that exposes the catalogue's category and tag facet counts (storefront filter chips) as a public `GET /products/categories` endpoint. It adds no business logic — it simply calls the service and maps the result into the project's standard response shapes.
- `src/modules/products/controllers/get-product-admin.ts` — Admin-only read controller that returns a product together with every language row it has, used by the editor's form to populate its language tabs. It is a thin wrapper around the `createItemController` factory, differing from the public `get-product-item` controller only in its fetch method and handler name.
- `src/modules/products/controllers/get-product-item.ts` — Thin controller for `GET /products/:id`. It delegates all real work to the shared `createItemController` factory and the product service, wiring together the caller's auth scope so that row visibility (active vs. inactive/deleted) is enforced per role.
- `src/modules/products/controllers/get-product-settings.ts`
- `src/modules/products/controllers/get-products.ts` — Defines the list/search controller for the products catalogue. It builds a Zod query-validation schema (shared by `GET /products` and `POST /products/search`), derives the cache-key parameter list from that schema, and wires both routes onto the shared `createSearchController` factory.
- `src/modules/products/controllers/restore-products.ts` — Thin wiring module that exposes the admin **restore** endpoint (`POST /products/:id/restore`) for the catalogue. It delegates all HTTP-handling logic to the shared `createRestoreController` factory and simply supplies product-specific collaborators (service, audit action, i18n key). The file exists to keep the module boundary clean so `routes.ts` can import a single named export without re-implementing restore semantics.
- `src/modules/products/controllers/update-product.ts` — Handler pair for `PUT /products/:id` (full replace) and `PATCH /products/:id` (partial merge), built on the shared `createUpdateController` factory. All actual writing delegates to `productService.writeUpdate`; the controller's job is body validation (via product-specific Zod schemas), multipart input decoding, and image-upload handling before the service call.
- `src/modules/products/domain/index.ts` — Barrel file that exposes the products domain layer's public API. It lets consumers import pure domain logic (e.g. stock calculations) without pulling in the module's HTTP surface or other infrastructure.
- `src/modules/products/domain/stock.ts` — Derives a customer-facing "available to buy" count from the two inventory counters (`onHand`, `reserved`) that `@modules/inventory` writes onto every product. It lives in the products domain (not in inventory or cart) because a product's catalogue availability is the product module's own invariant, following the same layering rationale as `tax.ts`'s `resolveTaxRate`.
- `src/modules/products/events.ts` — Declares the domain events the products module emits and exports their name constants. It augments the kernel's `DomainEventMap` via TypeScript module declaration so the event catalogue grows with each owning module rather than living in a shared enumeration file.
- `src/modules/products/factories.ts` — Builds product row fixtures for the `shop` scenario catalogue and for any test that needs a catalogue row. It deliberately sets only the required `title` and `price` fields (as placeholders), leaving every other field to the Mongoose schema's own `default:` values, so integration tests read seeded rows back through the real serializer rather than a guessed shape.
- `src/modules/products/index.ts` — Public barrel for the Products module and the **only** entry point a sibling module may import from (per `docs/theory/strategic-ddd.md` §5). It curates which symbols are exposed externally while keeping the repository, runtime schema, and transform functions strictly internal.
- `src/modules/products/model.ts` — Defines the Mongoose schema and document types for the `products` collection, the Zod validation schemas for the create/replace/update API operations, and the `ProductRecord` / `ProductSnapshot` type split that separates "what the shop stores" from "what an order line remembers." It owns the collection's shape but delegates stock mutations to `@modules/inventory` and derives `available` at serialization time so it can never drift.
- `src/modules/products/module.ts` — The manifest (registration) file for the **products** domain module. It declares the module's identity to the kernel — routes, permissions, config gates, translatable fields, image targets, and test scenarios — so the rest of the application can discover and branch on the product catalogue without importing its internals. Products is a leaf module: it emits events rather than importing sibling domains (cart, orders, inventory), making it the one reference point other contexts conform to.
- `src/modules/products/openapi.yaml` — OpenAPI 3.0.3 specification (v2.0.0) defining the full HTTP contract for the Products module: routes, parameters, request/response schemas, and error semantics. It exists as the single source of truth for what the products API exposes, enabling codegen, client typing, and documentation without reading the controllers.
- `src/modules/products/presenter.ts`
- `src/modules/products/probes.ts` — Holds hand-written API requests for the products module that a generated contract cannot express — validation-failure payloads, headers the generator omits, optional-parameter combinations, and visibility-rule edge cases. It complements the generated collection owned by `scripts/contracts/client-collections-bundle.ts`.
- `src/modules/products/repository.ts` — Defines and exports `productRepository`, the product catalogue's persistence layer. It composes the generic CRUD provided by `createRepository` with product-specific concerns: caller-scoped reads, public-visibility filtering, a single-snapshot facet aggregate, and three "derived write" ports (stock cache, translated fields, image digest) that other modules call to mirror already-decided state onto a product document without performing an admin edit.
- `src/modules/products/routes.ts` — Express router that wires every HTTP endpoint for the product catalogue: public storefront reads (search, list, single item, category facets) and admin/supplier writes (create, replace, update, delete, restore, hard-delete). It centralizes the cross-cutting concerns—authentication, permission checks, caching, rate-limiting, and image uploads—so controllers stay focused on business logic.
- `src/modules/products/services/crud.ts`
- `src/modules/products/services/image.ts`
- `src/modules/products/services/index.ts`
- `src/modules/products/services/lookups.ts`
- `src/modules/products/services/read.ts`
- `src/modules/products/services/remove.ts`
- `src/modules/products/services/search.ts`
- `src/modules/products/services/stock-view.ts`
- `src/modules/products/services/translated-write.ts`
- `src/modules/products/services/validation.ts`
- `src/modules/products/tax.ts` — Resolves a product's `taxClass` into the concrete decimal VAT rate it is charged. It lives in the products module (not orders) because "every product resolves to a rate" is a catalogue invariant; orders merely freeze whatever this function returns.
- `src/modules/products/tests/contract/api.contract.test.ts` — Contract tests for the `/products` API. They assert that every wire response (and error shape) conforms to the schema declared in `openapi.yaml`, including `additionalProperties: false` guards that catch accidental field leaks. Behavioural logic (visibility by role, pagination math) is deferred to unit/service suites; this file only ensures each contract branch is actually exercised and the response *shape* is correct.
- `src/modules/products/tests/contract/stock-visibility.contract.test.ts`
- `src/modules/products/tests/factories.ts` — Test-database-persisting helpers for the `products` module. It re-exports the pure in-memory builder from `../factories` and adds thin wrappers around `productRepository` so integration and contract tests across many modules can create, read, mutate, and delete product fixtures without importing the repository directly.
- `src/modules/products/tests/integration/api-key-reads.test.ts`
- `src/modules/products/tests/integration/delete-restore-audit.test.ts`
- `src/modules/products/tests/integration/delete-titles.test.ts`
- `src/modules/products/tests/integration/facets.test.ts` — Integration tests for `productRepository.facets`, the storefront's filter-chip data. The tests pin the contract that facet counts reflect **only public, active, non-deleted products**, that results are deterministically sorted, and that an empty catalogue yields empty arrays rather than an error. They exist to catch visibility-drift that a passing listing query would not surface (a chip pointing at zero results).
- `src/modules/products/tests/integration/image-clear.test.ts`
- `src/modules/products/tests/integration/model.test.ts` — Integration test suite that guarantees the Products API never leaks MongoDB internals (`_id`, `__v`) in any response path. It covers the two distinct serialization mechanisms: hydrated Mongoose documents (which rely on the `toJSON` virtual) and `.lean()` query results (which bypass `toJSON` and must be mapped manually).
- `src/modules/products/tests/integration/no-translation-provider.test.ts` — Integration test suite that verifies the `products` service degrades gracefully when no translation port is registered (i.e. the `locales` module is absent). It proves that the fallback locale still reads and writes successfully, and that any other locale produces a field-specific 422 rather than the 500 that the missing port used to throw before the kernel-level fallback was added.
- `src/modules/products/tests/integration/repository.test.ts` — Integration tests for `productRepository` CRUD operations and aggregate reads (`facets`) executed against a real MongoDB instance. The file also pins the empty-catalogue behavior of aggregate pipelines (which return *no* row rather than a zeroed one) and the idempotency/staleness semantics of `writebackImage`.
- `src/modules/products/tests/integration/schema-contract.test.ts` — Verifies that the Mongoose schema *declarations* for the Product model (the `required` constraint, `select: false` on `_id`/`__v`, `toJSON` serialization) behave as intended against a real Mongo instance. It exists to pin down driver-level semantics that sibling specs (which cover application transforms) intentionally leave out.
- `src/modules/products/tests/integration/service.test.ts` — Integration tests for the `productService` module, exercising validation (`validateCreateData`, `validateUpdateData`), caller-scoped `search`/`getById` visibility rules, and the create/update/remove flows including their side effects on the image store and (on hard delete) the carts holding the product. Runs against a real test database with port-level doubles for external collaborators.
- `src/modules/products/tests/integration/transactional-write.test.ts`
- `src/modules/products/tests/unit/config.test.ts` — Unit tests for the products module's VAT-rate boot gate. Verifies that `assertRequiredConfig` rejects missing or malformed `NODE_VAT_RATE_DEFAULT` / `NODE_VAT_RATE_REDUCED` values, accepts valid ones, and that the public readers (`vatRateDefault`, `vatRateReduced`) resolve per-call with correct fallbacks.
- `src/modules/products/tests/unit/factories.test.ts` — Unit tests for the `makeProduct` fixture builder. They pin down the factory's contract: which fields are always present, how overrides interact with Mongoose schema defaults, how `undefined` values are stripped, and how falsy-but-meaningful values are preserved. Because the same factory is used by `scenarios/products.ts` to seed the shipped demo catalogue, a regression here propagates beyond the test suite into production fixtures.
- `src/modules/products/tests/unit/routes.test.ts` — Structural contract tests for the product catalogue's Express router. They verify that the route table is mounted exactly as documented (no extra or missing endpoints), that static paths are ordered before parameterised ones, that authorization guards are present and correctly sequenced, that cache tags are consistent between readers and writers, and that upload/validation and route-flag middleware are in the right places. The file exists to catch regressions a type checker cannot: a dropped guard, a shadowed path, a renamed cache tag, or a misapplied upload field.
- `src/modules/products/tests/unit/schema-contract.test.ts` — Locks down the product schema's contract — required fields, validation bounds, defaults, and index declarations — and pins the behavior of `applyProductTransform`'s derived `available` value. It exists so that any change to the schema or transform must consciously update these expectations, making the "what a product means when a field was never set" contract explicit and regression-safe.
- `src/modules/products/tests/unit/stock-view.test.ts`
- `src/modules/products/tests/unit/stock.test.ts` — Unit tests for the pure `availableStock(onHand, reserved)` function. Exercises every input combination callers (`@modules/inventory`, `@modules/cart`) can pass, including `undefined` counters and the edge case where reserved exceeds on-hand.
- `src/modules/products/tests/unit/tax.test.ts` — Unit tests for `resolveTaxRate`, verifying that every product tax class (`undefined`, `"reduced"`, `"zero"`) resolves to a concrete numeric rate and never yields `undefined`. Also guards against env-var state leaking between cases by restoring the two VAT rate variables after every test.
- `src/modules/products/tests/unit/validation-messages.test.ts` — Verifies that the products module's Zod schemas emit locale-specific validation copy (Italian) instead of Zod's built-in default messages. It exists to guard the i18n wiring for the catalogue schema and its thunks, ensuring translation keys are resolved at parse time.

---
[[boilerplate-node-backend_INDEX|← boilerplate-node-backend index]]
