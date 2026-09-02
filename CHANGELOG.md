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
- `canTransition`'s "a write that changes nothing is always allowed" no-op path ignored `actor`
  entirely, so an admin resending `status: 'paid'` on an already-`paid` order was accepted as a
  200 — `orders/openapi.yaml`'s "`paid` on anything (only a confirmed payment writes that)" makes
  no exception for an echo write. The no-op path now still requires `system` for `paid`; every
  other status is unaffected, and the payment webhook's own idempotent retry (`paid` → `paid` as
  `system`) still succeeds.
- `PUT /account`, `POST /account/password` and `POST /account/logout-all` answered `404` for a
  token whose account had been deleted mid-session — a code none of the three declare, and
  inconsistent with the rest of the app: `GET /account` (whoami) has answered `401` for exactly
  this case since 3.0.0 ("a valid token for a deleted user answers `401`", above). All three now
  answer the `401` they already declare instead.
- An order that chose no shipping method got `shippingMethod: undefined` but `shippingCost: 0` —
  the schema defaulted the number while leaving the string genuinely absent, so the two fields
  disagreed about whether a method was chosen at all. `shared/contracts/openapi.root.yaml` states
  both absent together ("shipping is not required to buy"); `shippingCost` no longer defaults.
  A chosen method that happens to cost nothing (`pickup`, or `standard` above its `freeAbove`) is
  unaffected — `shippingMethod` is still frozen onto the order, only the no-method case changes.
  `db/migrations/20260820140000-order-shipping-cost.js` is removed with it: its one-time backfill
  existed to give every order the number the schema was about to start defaulting, and would now
  incorrectly zero a modern order that simply chose no method if it ever ran again.
- **No server-side password complexity policy existed** — the shared `Password` schema was
  `minLength: 8` with no other rule, so an 8-char all-lowercase password passed signup, admin
  user-create, password change and reset-confirm alike, even though the paired frontend's
  `usersPasswordSchema` already enforced upper+lower+digit+symbol and had done so unnoticed for a
  while: BE's own test suite proved the weak password was ACCEPTED, and nothing server-side ever
  drove a client through the check FE only ever performs in the browser. A new `PasswordNew`
  schema carries the rule in prose (no `pattern`: a lookahead-based one breaks
  `tests/support/spec-arbitraries.ts`'s fuzz generator) on every password-SETTING field — signup,
  reset-confirm, change, admin user create/update — while `Password` stays permissive on the three
  password-PROVING fields (login, the current-password leg of a change, re-auth), so no existing
  account is locked out. Enforced server-side by `zodUserSchema` (`src/modules/users/model.ts`),
  mirroring the frontend's four rules message-for-message.

### Changed

- **The audit vocabulary stopped repeating what a typed field already says.** Every `AuditEvent`
  already carries `outcome` (`success`/`failure`) and `actor_role`, so an action name that also
  encoded one — `auth.signup.succeeded` and `auth.signup.failed`, `auth.logout.succeeded`,
  `auth.logout_all.succeeded`, `auth.refresh.succeeded`/`.failed`,
  `auth.password_change.completed`/`.failed` — collapsed to one action per idea
  (`auth.signup`, `auth.logout`, `auth.logout_all`, `auth.token.refreshed`,
  `auth.password.changed`), with the field carrying the distinction the name used to. Two-step
  flows (`auth.password_reset.requested`/`.completed`, `auth.email_verify.*`,
  `auth.account_delete.*`) are unaffected — they name two distinct requests, not one request's
  outcome. `auth.account.updated` is now `auth.profile.updated`, matching the PHP twin's more
  specific naming while keeping the `auth.` prefix external saved searches key on. Orders dropped
  its `admin.`/`user.` prefixes entirely (`admin.order.created` → `order.created`, and so on) —
  `actor_role` already says who acted, so the prefix was the same fact twice, and it was also
  inconsistent with itself in the PHP twin (`order.created` bare, `admin.order.updated` prefixed).
  `user.payment.succeeded`/`.declined` are now `payment.confirmed`/`.failed`, matching the PHP
  twin's existing spelling. None of this is contract-breaking: `AuditEventItem.action` is a
  free-form string in `openapi.yaml`, not an enum, and no action name appears in demo data or is
  read by the frontend. `tests/cross-cutting/audit-actions.test.ts` gained a fourth check —
  `EXPECTED_NON_AUDITING`, the same allowlist shape `module-shape.test.ts` already uses for
  deliberately-disabled modules — so a module silently dropped from "expected to audit nothing"
  now fails a test instead of passing by omission. Its shape regex also relaxed from a 3-segment
  floor to 2, since several of the collapsed actions above are two segments
  (`auth.signup`, `order.created`) and none existed at that length before.
- Whether a product may be in a cart is decided once, in `cart/services/items.ts`, so every caller
  adding a single product inherits it — the two routes above and the wishlist's exit, which reads
  the cart's refusal rather than re-deriving "is it still on sale" for itself. `cartItemSetById`
  and `cartItemAddById` therefore answer a response envelope like the rest of the module.
  `services/reorder.ts` keeps its own resolution deliberately: a discontinued line there is SKIPPED
  rather than refused, and it resolves the whole order in one pass instead of one read per line.
- **BREAKING (contract):** the readiness payload's `nodeVersion` is now `runtimeVersion`. The old
  name forced every implementation to emit a Node-shaped key for its own runtime — the PHP twin
  was satisfying it with `PHP_VERSION`, a field named for one runtime carrying another's number.
  Same defect as the prose below, one layer down in the typed half. A consumer reading
  `health.nodeVersion` now gets `undefined`; the only one in this working set is the admin
  overview card, updated with it. The field also gains the `description` it never had, which is
  half the reason nobody noticed. Not split into `runtime` + `runtimeVersion`: that buys a second
  required field for information nothing has asked for.
- The shared contract stopped describing one implementation. Five descriptions in `openapi.yaml`
  named Node-only things — `NODE_METRICS_TOKEN`, `NODE_AUDIT_RETENTION_DAYS`,
  `NODE_LOW_STOCK_THRESHOLD`, `NODE_TOKEN_REFRESH_TIME_*`, and worst,
  `process.memoryUsage()` plus a TypeScript test path presented as what guarantees a claim. That
  file is byte-identical in three repositories, so two of its three readers were being told
  something untrue. The prose now says what the thing IS rather than what enforces it here. Prose
  only: every generated change is a JSDoc comment or a `.describe()` string, verified by diffing
  `api/` before and after. Two more surfaced on a second sweep and are fixed the same way:
  `OrderStatus` cited `domain/lifecycle.ts` as the authority on which status may follow which,
  and the locale entry `key` justified a correct rule (store it flat, dotted, as a string) with
  MongoDB `$set` semantics — true here, meaningless where those rows are a relational table.
- `GET /feedback` declared `status` as a bare `type: string` while `POST /feedback/search`
  declared it as a four-value enum — one filter, documented as open on one spelling of a search
  and closed on the other. The closed set is now a single `FeedbackRequestStatus` schema, `$ref`d
  from all five places that had been spelling it out or omitting it. No generated type is renamed:
  the extracted component takes the name orval had already derived from the inline copy, so the
  client diff is the deletion of two invented duplicates.
  `tests/cross-cutting/contract-search-parity.test.ts` compares the validation shape of every
  filter across both spellings, so the next one cannot drift silently.
- The four searches cache under one identity per resource, so `GET /products?text=x` and
  `POST /products/search {text}` are a single entry and whichever asks first warms the other. The
  `POST` form is cached in Redis only; the wire says `no-store`, because a POST response is not
  browser-cacheable under RFC 9110. Body values are normalised so a JSON `1` and a query-string
  `'1'` agree, and the key is still built from the endpoint's declared parameter allowlist — an
  undeclared field cannot mint an entry.
- `GET /inventory/levels`, `GET /inventory/movements`, `GET /locales/{locale}/entries` and
  `GET /observability/audit` read the query string only. They declared a request body they could
  never receive, being GETs with no body-carrying sibling; `readInput` gained a `list` surface to
  say so. No client-visible change — the body was unreachable.

### Added

- `x-alias-of` on the fourteen operations that are a second spelling of another — the four
  `POST /*/search` siblings, the collection `PUT`/`DELETE` forms, the `/hard` delete paths and
  `PUT /cart/{productId}`. Each names the operation a caller should reach for by default, which
  is what "functionally equivalent to X" never said. **No generated type changed** (verified
  byte-for-byte): an `x-` extension is invisible to orval, which is the point — `deprecated: true`
  would have put a warning in the paired frontend for routes this API intends to keep.
  `tests/cross-cutting/contract-aliases.test.ts` asserts every alias resolves, is not itself
  aliased, and answers success with its canonical's status AND schema.
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
- `Product.requiresShipping` (default `true`). `false` marks a digital good; `POST /cart/checkout`
  now refuses a `shippingMethodId` (`409 CART_SHIPPING_NOT_APPLICABLE`) when every line in the
  cart is one — naming a method for a purchase that never ships is a client error, not a lookup
  that might resolve. A cart mixing digital and physical lines is unaffected. Non-breaking:
  additive and defaulted, so an existing client sending nothing still gets today's behaviour.

[3.0.0]: https://github.com/Guebbit/boilerplate-node-backend/releases/tag/v3.0.0
