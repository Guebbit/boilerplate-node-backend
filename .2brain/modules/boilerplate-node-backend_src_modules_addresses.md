---
tags:
  - 2brain
  - 2brain/module
  - project/boilerplate-node-backend
type: module
module: src/modules/addresses/
files: 24
updated: 2026-10-07T23:56:24.303283+00:00
---

# src/modules/addresses/

## Purpose

The **addresses** module owns the per-user address book: creating, listing, updating, and deleting shipping/delivery addresses, enforcing the invariant that a non-empty book always has exactly one entry flagged `default`, and exposing that default as the ship-to slot during checkout. It handles PII encryption transparently so callers see plaintext, and it registers itself as a standalone module so sibling modules (cart, users) never need to import the `account` module to reach address data.

## Key parts

- **HTTP layer** — `routes.ts` mounts the Express router at `/account`; the five controllers (`get-addresses`, `post-address`, `update-address`, `delete-address`, `put-address-default`) are thin adapters that extract the user ID, delegate to the service, and serialise the response.
- **Service & domain** — `service.ts` translates controller intents into repository calls and shapes the `AddressesView` wire format. `module.ts` is the kernel registration: routes, personal-data lifecycle hooks, and locale path.
- **Persistence** — `model.ts` defines the Mongoose schema (one document per user, items as subdocuments with their own `_id`). `repository.ts` implements read-modify-write CRUD, enforces the single-default invariant, and coordinates PII encrypt/decrypt. `pii.ts` centralises per-field encryption; `reencrypt.ts` handles key-rotation re-encryption.
- **Supporting infrastructure** — `config.ts` (module config), `factories.ts` (domain-to-Mongoose shape mapping), `presenter.ts` (view shaping), `openapi.yaml` (API contract), `index.ts` (the barrel facade that enforces the strategic-DDD import boundary).
- **Tests** — Integration suites cover cross-cutting invariants (single-default, cross-user 404, checkout resolver, PII round-trip). Unit tests pin the router contract, schema shape, and fixture-builder correctness.

## How it connects

- **`src/modules/account/`** — The addresses router is mounted under `/account` alongside the account module's own router. The addresses module exists so that address concerns are decoupled from the account module's internal surface.
- **`src/modules/cart/`** — The only sibling consumer of the addresses module's public API (via `index.ts`). Cart reads the default or a named address at checkout time.
- **`src/modules/users/`** — Reaches address data solely through the `personalData.erase` hook declared in `module.ts`, never by importing the module directly.
- **`src/infrastructure/http/`** — Provides the Express router, middleware (auth, no-cache), and response helpers that `routes.ts` and the controllers consume.
- **`src/modules/orders/`** — The checkout/shipping flow consumes the address book's default (or explicitly selected) entry as the delivery destination.

## Where to start

Read `openapi.yaml` first — it states the full REST surface and the single-default invariant in one page, giving you the "what" before the "how." Then move to `repository.ts`; it is the file where the invariant logic, PII handling, and Mongoose read-modify-write cycle all converge, and understanding it makes the service and controller layers straightforward.

## Connected modules
```mermaid
flowchart LR
    m_src_modules_addresses["src/modules/addresses/"]
    m_scenarios["scenarios/<br/>42 files"]
    m_scripts_ops["scripts/ops/<br/>24 files"]
    m_src["src/<br/>34 files"]
    m_src_infrastructure["src/infrastructure/<br/>67 files"]
    m_src_infrastructure_http["src/infrastructure/http/<br/>29 files"]
    m_src_modules_account["src/modules/account/<br/>107 files"]
    m_src_modules_cart["src/modules/cart/<br/>56 files"]
    m_src_modules_orders["src/modules/orders/<br/>91 files"]
    m_src_modules_products["src/modules/products/<br/>57 files"]
    m_src_modules_users["src/modules/users/<br/>49 files"]
    m_src_modules_addresses --- m_scenarios
    m_src_modules_addresses --- m_scripts_ops
    m_src_modules_addresses --- m_src
    m_src_modules_addresses --- m_src_infrastructure
    m_src_modules_addresses --- m_src_infrastructure_http
    m_src_modules_addresses --- m_src_modules_account
    m_src_modules_addresses --- m_src_modules_cart
    m_src_modules_addresses --- m_src_modules_orders
    m_src_modules_addresses --- m_src_modules_products
    m_src_modules_addresses --- m_src_modules_users
    style m_src_modules_addresses stroke-width:3px
```

[[boilerplate-node-backend_ROOT|/ (repository root)]] · [[boilerplate-node-backend_scenarios|scenarios/]] · [[boilerplate-node-backend_scripts_ops|scripts/ops/]] · [[boilerplate-node-backend_src|src/]] · [[boilerplate-node-backend_src_infrastructure|src/infrastructure/]] · [[boilerplate-node-backend_src_infrastructure_http|src/infrastructure/http/]] · [[boilerplate-node-backend_src_modules_account|src/modules/account/]] · [[boilerplate-node-backend_src_modules_cart|src/modules/cart/]] · [[boilerplate-node-backend_src_modules_orders|src/modules/orders/]] · [[boilerplate-node-backend_src_modules_products|src/modules/products/]] · [[boilerplate-node-backend_src_modules_users|src/modules/users/]]

## Files
- `src/modules/addresses/config.ts`
- `src/modules/addresses/controllers/delete-address.ts` — Thin HTTP adapter for `DELETE /account/addresses/:addressId`. Extracts the authenticated user ID and target address ID from the request, delegates all business logic to the `addressRemove` service, and translates the result into an Express response.
- `src/modules/addresses/controllers/get-addresses.ts` — Express controller that handles `GET /account/addresses`. It is a thin HTTP adapter: it extracts the caller's id from the auth context, delegates to the service layer, and serialises the result. It exists to separate transport concerns (Express request/response) from domain logic in the addresses service.
- `src/modules/addresses/controllers/post-address.ts` — HTTP handler for `POST /account/addresses`. Validates the request body, delegates to the address service, and shapes the JSON response. It is the "create" half of the address-book CRUD set (sibling files handle read, update, delete).
- `src/modules/addresses/controllers/put-address-default.ts`
- `src/modules/addresses/controllers/update-address.ts` — Defines the two HTTP handlers for `/account/addresses/:addressId` — a full **PUT** (replace) and a partial **PATCH** (merge) — by calling the shared `createUpdateController` factory once and destructuring the two resulting handlers.
- `src/modules/addresses/factories.ts` — Builds address-book fixtures (the row shape passed to `addressBookRepository.create`) from a small set of caller-supplied overrides. The file exists to centralise the mapping from a domain-level `Address` (with a string `id`) into the Mongoose document shape (`_id` as `ObjectId`) so callers never assemble the persistence object by hand.
- `src/modules/addresses/index.ts` — Public barrel (module facade) for the **Addresses** module. It is the _only_ import surface a sibling module is allowed to use, enforcing the strategic-DDD boundary described in `docs/theory/strategic-ddd.md` §5. It re-exports the service's values and the model's types so consumers never reach into sub-paths directly.
- `src/modules/addresses/model.ts` — Defines the Mongoose schema and model for a user's address book: one document per user (keyed by `userId`), holding an array of address entries as subdocuments. The design intentionally gives each entry its own `_id` so two entries with identical fields are still distinct ("home" vs. "office"), in contrast to cart/wishlist line items which are identified by their content.
- `src/modules/addresses/module.ts` — Registers the **addresses** module with the application kernel: declares its HTTP routes, personal-data lifecycle hooks, and locale path. It exists as a standalone module so that `cart` (the only sibling consumer) and `users` (via the `personalData.erase` hook) never need to import `account` to reach address data.
- `src/modules/addresses/openapi.yaml` — OpenAPI 3.0.3 contract for the **addresses** module. It specifies the REST surface for managing a per-user address book (list, add, replace, patch, remove) and encodes the module's core invariant: a non-empty book always has exactly one entry flagged `default`, which is the slot checkout ships to when no explicit `addressId` is supplied.
- `src/modules/addresses/pii.ts` — Centralizes per-field PII encryption and decryption for address-book entries (`fullName`, `street`, `city`, `zip`, `country`, `phone`). It exists so `./repository` can encrypt whole entries on write and decrypt them on read without duplicating six-field logic at each call site.
- `src/modules/addresses/presenter.ts`
- `src/modules/addresses/reencrypt.ts`
- `src/modules/addresses/repository.ts` — Read-modify-write repository for a user's address book. It owns the full CRUD surface (find, add, update, remove, hard-delete), enforces the "exactly one default" invariant across the entire `items` array, and handles PII encryption on write / decryption on read so that every caller sees plaintext.
- `src/modules/addresses/routes.ts` — Defines the Express router for the address-book CRUD endpoints. It is mounted at `/account` alongside the account module's own router (see `module.ts`) and wires each HTTP verb to a thin controller, guarded by auth and no-cache middleware.
- `src/modules/addresses/service.ts` — Service layer for the address book. It translates controller intents into repository calls, maps stored documents to the public `AddressesView` wire format, and wraps results in standardized success/reject responses. All endpoints answer the whole book (never a single entry) because the "exactly one default" invariant is a property of the list.
- `src/modules/addresses/tests/factories.ts`
- `src/modules/addresses/tests/integration/addresses.test.ts` — Integration test suite for the address book module. It verifies four cross-cutting invariants: (1) a non-empty book always has exactly one default, (2) another user's entry is indistinguishable from a non-existent one (404), (3) the checkout resolver's three-way answer (default, named, or absent) and its failure modes, and (4) PII fields are stored encrypted and round-trip correctly through the repository.
- `src/modules/addresses/tests/integration/checkout.test.ts`
- `src/modules/addresses/tests/integration/fixtures.ts`
- `src/modules/addresses/tests/unit/factories.test.ts` — Unit tests for the `makeAddressBook` fixture builder. Verifies that the factory produces address-book documents with correct `ObjectId` handling, proper omission of absent optional fields, and faithful pass-through of deliverable fields — ensuring test fixtures seeded into the DB are edit- and delete-able.
- `src/modules/addresses/tests/unit/routes.test.ts` — Unit test that pins the addresses router's contract: the exact set of endpoints (and their order), the middleware/guards applied at the router level and per-route, and the absence of middleware that must not be present. It exists to catch silent regressions where a route is reordered, a guard is dropped, or an unwanted cache/rate-limit middleware sneaks in.
- `src/modules/addresses/tests/unit/schema-contract.test.ts` — Unit test that pins the public contract of `addressBookSchema` — its required fields, indexes, defaults, references, and the shape of its `items` sub-document — so that schema drift is caught in CI. It mirrors the structure of the cart and wishlist schema-contract tests while asserting the one way the address book differs: its line items keep an Mongoose `_id`.

---
[[boilerplate-node-backend_INDEX|← boilerplate-node-backend index]]
