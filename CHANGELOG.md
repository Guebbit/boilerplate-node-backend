# Changelog

All notable changes to this API's contract are recorded here. The contract is `openapi.yaml`;
a breaking change is one a generated client cannot absorb without being regenerated.

## [3.0.0] - 2026-08-23

The release that made this API a **modular monolith with a domain layer**, and made its contract
this repository's output rather than a document two repositories shared. `main` forked from the
2.1.0 line before that release was cut, so everything here is new since 2.1.0.

A generated client cannot absorb it without being regenerated.

### The pattern

A domain is a folder under `src/modules/`, declared by one manifest carrying its routes,
repositories, contract fragment and demo fixtures. Deleting a domain is `rm -rf` plus one line of
`src/modules.ts`.

Four tiers, with the arrows pointing one way: `infrastructure` (the technical substrate) →
`kernel` (the module system) → `modules` (the domains, each with an optional pure `domain/` layer)
→ `app` (composition). Each module classifies itself `core` / `supporting` / `generic`, so
modelling effort is spent where the business is, and its dependency edges are a typed context map
rather than a list.

The contract is fragmented per module and assembled into `openapi.yaml` — **this repo's output,
the paired frontend's input.**

### Breaking — contract

- **Stock is a reservation model.** `Product.stock` → read-only `onHand` / `reserved` /
  `available`. Changes go through `POST /inventory/receipts` or `/adjustments`; `/restock` is gone.
- **Translation `scope` becomes `tenant`** — one keyspace per team rather than one per side, with
  `GET /locales/tenants` and a migration mapping `app` → `demo-fe`, `api` → `demo-be`.
- **This API owns the dictionaries a client downloads.** `LocaleCapabilities.locales` carries
  objects, not language tags.
- **`/health` answers readiness**: one `dependencies` vocabulary for database, cache and queue,
  plus `telemetry`.
- **The audit trail pages like every other collection** — `{ items, meta }`, `page` / `pageSize`.
- **Whoami serves the row**, and a valid token for a deleted user answers `401`.
- **One emitter per analytics event**, so a name shared with the frontend is not counted twice.
- **The demo dataset declares** whether each collection is served raw, composed, or never.

### Added

- **A demo profile** — `npm run demo` boots the real app on an in-memory MongoDB, no Docker; this
  is what the frontend's e2e suite runs against.
- **Payments** and **delivery** behind provider ports with fakes, **inventory** movements, and
  **analytics** behind a port defaulting to Umami.
- **Two credential budgets**, counted in a shared store every worker can see — they previously
  counted per process while the cluster forks a worker per CPU.
- Customer surface (self-service, wishlist, addresses, cancellation, facets), checkout email,
  sessions with a remember tier, production deployment.

### Breaking — tooling

Strict type-checked linting that fails on warnings; `complete:fix` is a gate, not a formatter; the
byte-mirrored contract files require the paired frontend at the matching commit. Backlog documents
were removed and are kept out by a test.

## Unreleased

### Fixed

- `GET /products/{id}`, `GET /orders/{id}`, `GET /orders/{id}/invoice` and `GET /users/{id}` now
  declare the `422` they can already answer. A malformed id is rejected before the query runs — the
  same response the twenty-five other id-taking operations already documented — so the contract
  described the same request shape two different ways depending on which route received it.
  `tests/cross-cutting/contract-error-declarations.test.ts` keeps them in step.
- `GET /feedback` no longer declares a JSON request body, and `POST /feedback/search` carries the
  DTO form instead — the sibling the other three searchable resources already had. A body on a GET
  has no defined semantics (RFC 9110 9.3.1) and the Fetch spec refuses to send one, so no browser
  could use it; worse, the route is cached and `setCache` keys on the declared **query**
  parameters, so a filter that did arrive in a body was invisible to the key and two different
  searches by the same admin shared one page for the cache's lifetime.
- `DELETE /users`, `DELETE /products` and `DELETE /orders` declare the `hardDelete` query parameter
  they already read. All six delete operations now reference one shared `HardDeleteParam`, so a
  soft-deleting domain cannot offer two of the flag's three spellings by accident.

- A cart line could name a product the storefront refuses to show. Whether a product may be in a
  cart was decided per route, so each route answered differently or not at all: `POST /cart` asked
  `productService.getById` with **no scope**, admitting a hidden or soft-deleted product;
  `PUT /cart/{productId}` asked the catalogue nothing, so a well-formed id no product has ever had
  created a stored line — invisible in every response, because the view drops a reference that
  resolves to nothing, and priced at checkout; and `POST /wishlist/{productId}/move-to-cart` moved
  a saved product that had since been withdrawn, a wishlist outliving the catalogue being the
  ordinary case rather than the exotic one. All three now answer the `404` each operation already
  declared. No contract change.

### Changed

- Whether a product may be in a cart is decided once, in `cart/services/items.ts`, so every caller
  adding a single product inherits it — the two routes above and the wishlist's exit, which reads
  the cart's refusal rather than re-deriving "is it still on sale" for itself. `cartItemSetById`
  and `cartItemAddById` therefore answer a response envelope like the rest of the module.
  `services/reorder.ts` keeps its own resolution deliberately: a discontinued line there is SKIPPED
  rather than refused, and it resolves the whole order in one pass instead of one read per line.
- `GET /inventory/levels`, `GET /inventory/movements`, `GET /locales/{locale}/entries` and
  `GET /observability/audit` read the query string only. They declared a request body they could
  never receive, being GETs with no body-carrying sibling; `readInput` gained a `list` surface to
  say so. No client-visible change — the body was unreachable.

### Added

- `src/modules/wishlist/probes.ts` — the four requests a contract cannot describe for this module,
  wired into `scripts/contracts/generate-collections.ts`. The wishlist was the only routed
  storefront module whose generated collections carried no rejection requests at all.
- `tests/integration/concurrency/wishlist-races.test.ts`. `wishlist/repository.ts` carries no retry
  budget where `cart/repository.ts` carries one, and argued that from the shape of its writes;
  these hold it to the argument. The document-level claim turns on the filter being an exact
  equality on the unique key, which mongod resolves atomically — measured at 25-way contention —
  and is not a general property of upserting under a unique index.
- `docker-compose.yml` passes `NODE_AUTH_RATE_LIMIT_ADDRESS_MAX` through like its two siblings. The
  credential budget is a pair — per account named, per address calling — so a live E2E run that
  raised only the global limit merely moved which bucket it tripped over.

[3.0.0]: https://github.com/Guebbit/boilerplate-node-backend/releases/tag/v3.0.0
