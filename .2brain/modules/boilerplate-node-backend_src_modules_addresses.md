---
tags:
  - 2brain
  - 2brain/module
  - project/boilerplate-node-backend
type: module
module: src/modules/addresses/
files: 17
updated: 2026-09-27T16:18:45.554619+00:00
---

# src/modules/addresses/

## Purpose

The addresses module owns a per-user address book: a small CRUD surface for managing shipping addresses, where every non-empty book carries exactly one entry flagged as `default`. It encapsulates PII encryption at rest, enforces the "one default" invariant on every mutation, and exposes a strict public interface (via `index.ts`) so sibling modules can resolve a shipping address without reaching into internal files.

## Key parts

- **HTTP layer** (`routes.ts`, `controllers/`) — Express router mounted at `/account/addresses`; thin controllers for GET, POST, PUT, PATCH, and DELETE that extract auth context and delegate to the service.
- **Service & domain logic** (`service.ts`, `factories.ts`) — Translates controller intents into repository calls, maps documents to the public `AddressesView` wire shape, and wraps results in standard success/reject responses. The factory centralises domain-to-Mongoose shape conversion for tests and seeding.
- **Persistence** (`model.ts`, `repository.ts`, `pii.ts`) — Mongoose schema (one document per user, `items` sub-docs each with their own `_id`); a read-modify-write repository that enforces the single-default invariant and handles all CRUD; and a PII helper that encrypts/decrypts the six sensitive fields so callers always see plaintext.
- **Module wiring** (`module.ts`, `index.ts`) — `module.ts` registers routes, the `personalData.erase` lifecycle hook, and locale path with the application kernel. `index.ts` is the sole import surface for other modules, enforcing the strategic-DDD boundary.
- **Contract & tests** (`openapi.yaml`, `tests/`) — OpenAPI 3.0 spec documenting the REST surface and the default-address invariant; integration tests covering cross-cutting invariants (one-default, tenant isolation, checkout resolution, PII round-trip); unit tests pinning the schema, factory, and router contracts.

## How it connects

- **`src/modules/cart/`** — The primary consumer. Cart's checkout resolver asks addresses for the user's default entry (or a named one) to obtain the shipping destination when no explicit `addressId` is supplied.
- **`src/modules/users/`** — Consumes the `personalData.erase` hook registered in `module.ts` to hard-delete a user's address-book PII during account deletion.
- **`src/modules/account/`** — Co-mounts its router at the same `/account` prefix; addresses sits alongside account's own routes under that path.
- **`src/kernel/`** — The application kernel loads `module.ts` to discover routes and lifecycle hooks during boot.
- **`src/infrastructure/http/`** — Supplies the auth and no-cache middleware that `routes.ts` applies to every address endpoint.
- **`src/infrastructure/`** — Provides the cryptographic primitives that `pii.ts` uses for field-level encryption/decryption.

## Where to start

Read **`service.ts`** first — it is short, shows the full read/write flow, the `AddressesView` mapping, and makes the "always return the whole book" rule obvious. Then read **`repository.ts`** to see how the single-default invariant is enforced across the `items` array and how PII encryption is applied transparently on every read/write. Together they give you the domain picture before you need to touch controllers or the schema.

## Connected modules
```mermaid
flowchart LR
    m_src_modules_addresses["src/modules/addresses/"]
    m_scenarios["scenarios/<br/>26 files"]
    m_src["src/<br/>19 files"]
    m_src_infrastructure["src/infrastructure/<br/>44 files"]
    m_src_infrastructure_http["src/infrastructure/http/<br/>19 files"]
    m_src_kernel["src/kernel/<br/>11 files"]
    m_src_modules_account["src/modules/account/<br/>68 files"]
    m_src_modules_cart["src/modules/cart/<br/>38 files"]
    m_src_modules_orders["src/modules/orders/<br/>65 files"]
    m_src_modules_products["src/modules/products/<br/>39 files"]
    m_src_modules_users["src/modules/users/<br/>33 files"]
    m_src_modules_addresses --- m_scenarios
    m_src_modules_addresses --- m_src
    m_src_modules_addresses --- m_src_infrastructure
    m_src_modules_addresses --- m_src_infrastructure_http
    m_src_modules_addresses --- m_src_kernel
    m_src_modules_addresses --- m_src_modules_account
    m_src_modules_addresses --- m_src_modules_cart
    m_src_modules_addresses --- m_src_modules_orders
    m_src_modules_addresses --- m_src_modules_products
    m_src_modules_addresses --- m_src_modules_users
    style m_src_modules_addresses stroke-width:3px
```

[[boilerplate-node-backend_ROOT|/ (repository root)]] · [[boilerplate-node-backend_scenarios|scenarios/]] · [[boilerplate-node-backend_src|src/]] · [[boilerplate-node-backend_src_infrastructure|src/infrastructure/]] · [[boilerplate-node-backend_src_infrastructure_http|src/infrastructure/http/]] · [[boilerplate-node-backend_src_kernel|src/kernel/]] · [[boilerplate-node-backend_src_modules_account|src/modules/account/]] · [[boilerplate-node-backend_src_modules_cart|src/modules/cart/]] · [[boilerplate-node-backend_src_modules_orders|src/modules/orders/]] · [[boilerplate-node-backend_src_modules_products|src/modules/products/]] · [[boilerplate-node-backend_src_modules_users|src/modules/users/]]

## Files
- `src/modules/addresses/controllers/delete-address.ts` — Thin HTTP adapter for `DELETE /account/addresses/:addressId`. Extracts the authenticated user ID and target address ID from the request, delegates all business logic to the `addressRemove` service, and translates the result into an Express response.
- `src/modules/addresses/controllers/get-addresses.ts` — Express controller that handles `GET /account/addresses`. It is a thin HTTP adapter: it extracts the caller's id from the auth context, delegates to the service layer, and serialises the result. It exists to separate transport concerns (Express request/response) from domain logic in the addresses service.
- `src/modules/addresses/controllers/post-address.ts` — HTTP handler for `POST /account/addresses`. Validates the request body, delegates to the address service, and shapes the JSON response. It is the "create" half of the address-book CRUD set (sibling files handle read, update, delete).
- `src/modules/addresses/controllers/update-address.ts` — Defines the two HTTP handlers for `/account/addresses/:addressId` — a full **PUT** (replace) and a partial **PATCH** (merge) — by calling the shared `createUpdateController` factory once and destructuring the two resulting handlers.
- `src/modules/addresses/factories.ts` — Builds address-book fixtures (the row shape passed to `addressBookRepository.create`) from a small set of caller-supplied overrides. The file exists to centralise the mapping from a domain-level `Address` (with a string `id`) into the Mongoose document shape (`_id` as `ObjectId`) so callers never assemble the persistence object by hand.
- `src/modules/addresses/index.ts` — Public barrel (module facade) for the **Addresses** module. It is the _only_ import surface a sibling module is allowed to use, enforcing the strategic-DDD boundary described in `docs/theory/strategic-ddd.md` §5. It re-exports the service's values and the model's types so consumers never reach into sub-paths directly.
- `src/modules/addresses/model.ts` — Defines the Mongoose schema and model for a user's address book: one document per user (keyed by `userId`), holding an array of address entries as subdocuments. The design intentionally gives each entry its own `_id` so two entries with identical fields are still distinct ("home" vs. "office"), in contrast to cart/wishlist line items which are identified by their content.
- `src/modules/addresses/module.ts` — Registers the **addresses** module with the application kernel: declares its HTTP routes, personal-data lifecycle hooks, and locale path. It exists as a standalone module so that `cart` (the only sibling consumer) and `users` (via the `personalData.erase` hook) never need to import `account` to reach address data.
- `src/modules/addresses/openapi.yaml` — OpenAPI 3.0.3 contract for the **addresses** module. It specifies the REST surface for managing a per-user address book (list, add, replace, patch, remove) and encodes the module's core invariant: a non-empty book always has exactly one entry flagged `default`, which is the slot checkout ships to when no explicit `addressId` is supplied.
- `src/modules/addresses/pii.ts` — Centralizes per-field PII encryption and decryption for address-book entries (`fullName`, `street`, `city`, `zip`, `country`, `phone`). It exists so `./repository` can encrypt whole entries on write and decrypt them on read without duplicating six-field logic at each call site.
- `src/modules/addresses/repository.ts` — Read-modify-write repository for a user's address book. It owns the full CRUD surface (find, add, update, remove, hard-delete), enforces the "exactly one default" invariant across the entire `items` array, and handles PII encryption on write / decryption on read so that every caller sees plaintext.
- `src/modules/addresses/routes.ts` — Defines the Express router for the address-book CRUD endpoints. It is mounted at `/account` alongside the account module's own router (see `module.ts`) and wires each HTTP verb to a thin controller, guarded by auth and no-cache middleware.
- `src/modules/addresses/service.ts` — Service layer for the address book. It translates controller intents into repository calls, maps stored documents to the public `AddressesView` wire format, and wraps results in standardized success/reject responses. All endpoints answer the whole book (never a single entry) because the "exactly one default" invariant is a property of the list.
- `src/modules/addresses/tests/integration/addresses.test.ts` — Integration test suite for the address book module. It verifies four cross-cutting invariants: (1) a non-empty book always has exactly one default, (2) another user's entry is indistinguishable from a non-existent one (404), (3) the checkout resolver's three-way answer (default, named, or absent) and its failure modes, and (4) PII fields are stored encrypted and round-trip correctly through the repository.
- `src/modules/addresses/tests/unit/factories.test.ts` — Unit tests for the `makeAddressBook` fixture builder. Verifies that the factory produces address-book documents with correct `ObjectId` handling, proper omission of absent optional fields, and faithful pass-through of deliverable fields — ensuring test fixtures seeded into the DB are edit- and delete-able.
- `src/modules/addresses/tests/unit/routes.test.ts` — Unit test that pins the addresses router's contract: the exact set of endpoints (and their order), the middleware/guards applied at the router level and per-route, and the absence of middleware that must not be present. It exists to catch silent regressions where a route is reordered, a guard is dropped, or an unwanted cache/rate-limit middleware sneaks in.
- `src/modules/addresses/tests/unit/schema-contract.test.ts` — Unit test that pins the public contract of `addressBookSchema` — its required fields, indexes, defaults, references, and the shape of its `items` sub-document — so that schema drift is caught in CI. It mirrors the structure of the cart and wishlist schema-contract tests while asserting the one way the address book differs: its line items keep an Mongoose `_id`.

---
[[boilerplate-node-backend_INDEX|← boilerplate-node-backend index]]
