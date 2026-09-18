# Changelog

All notable changes to this API's contract are recorded here. The contract is `openapi.yaml`;
a breaking change is one a generated client cannot absorb without being regenerated.

## [Unreleased]

### Breaking — contract

- **`OrderItem.product` is `OrderLineProduct`, not `Product`.** The embedded snapshot drops
  `onHand`, `reserved` and the derived `available` — an order line is what a customer saw and
  bought, and those three describe the warehouse right now, not a fact about the sale. A client
  reading stock off an order's line items must read the live `GET /products/{id}` instead; nothing
  in the paired frontend read those three fields on an order. No deployment of this boilerplate
  had real order data yet, so the one-off script that would have stripped the leftover fields on
  existing rows was deleted unrun rather than kept as dead weight; new orders never write them.
- **`OrderLineProduct` drops `imageUrl`/`thumbnailUrl`; `OrderItem` gains `current`.** The picture
  is not a term of the sale, and freezing a url rather than the bytes never made it durable — the
  file it names can be replaced or hard-deleted at any time. `current` resolves it LIVE from the
  catalogue product instead: `{ imageUrl, thumbnailUrl? }`, or `null` once that product is gone,
  which is what lets "buy again" tell a deleted product apart from one that never had a picture. A
  client rendering an order's line image must read `items[].current`, not `items[].product`; a
  `null` renders `NODE_DEFAULT_IMAGE_PRODUCT`'s placeholder, not an error. See
  `docs/theory/defences/`.
- **`User.admin` is `User.role`.** The boolean became a role NAME, because a boolean could only
  ever say "unrestricted or not" and the model now separates the shop from the installation: a
  person holds one role inside the tenant and, rarely, a second over the platform. The seeded
  `root` is `owner`; every other account defaults to `customer`. A client reading `user.admin`
  must read `user.role` and compare against the names in `shared/authorization-roles.yaml`, or —
  better — read `GET /account/abilities`, which answers what the server's own rules permit rather
  than asking the client to infer it from a name.
- **The `admin` query filter on `GET /users` is `role`.** `?admin=true` becomes
  `?role=owner`, and the parameter is a string matched exactly rather than a boolean.
- **`GET /account/abilities` omits `tenantId` in platform scope** instead of sending `null`. The
  field was declared `nullable`, which the PHP twin's type generator refuses rather than guesses;
  a client reads `scope` to know which world the rules are about, and `tenantId` only when there
  is a shop to name.
- **`User.verified` is `User.verifiedAt` (nullable string date-time).** Enforcement moved off a
  route guard (`requireVerified`) and onto the permission model: `cart.checkout` gates checkout
  and the payments routes, held by every role except the new `unverified` — the role a fresh
  signup starts as. `verifiedAt` is informational only, read by nothing server-side; a client
  gating a checkout button must read `can('checkout', 'Cart')` off `GET /account/abilities`
  instead of the old boolean. The `EMAIL_NOT_VERIFIED` error code and its message are unchanged.
- **The `id` query/body filter on `GET|POST /products(/search)`, `GET|POST /users(/search)` and
  `GET|POST /orders(/search)` is an array.** `listProducts({ id: string })` becomes
  `id: string[]`; `?id=a` is still valid on the wire — it is a one-element array — but a client
  built against the old generated type must change its call sites. A batch read is a filter, not
  a lookup: missing ids are silently absent from the page rather than a 404, an empty array is a
  422 (never "everything"), and the cap is 100 ids per request. The single-item routes
  (`GET /products/{id}`, etc.) are unaffected. `userId`/`productId` on `GET /orders` stay scalar.
- **Every outbound webhook delivery body is now the Standard Webhooks envelope**, `{ type,
timestamp, data }`, instead of the bare per-event payload (`asyncapi.yaml`, `webhooks`
  module — a queue/realtime contract, not `openapi.yaml`, but the same "a generated client must
  regenerate" reasoning applies). `type` is the event name (`order.created`, `payment.failed`, …),
  `timestamp` is when the event occurred (stable across every retry of one delivery), and `data`
  is exactly the payload the old body was. A subscriber reading `orderId`/`paymentId`/`refund`
  off the top level must read them off `data` instead; the id stays in the `webhook-id` header,
  never repeated in the body. Fixes the gap where two event types sharing a subscription's filter
  (`payment.succeeded`/`payment.failed`, both `{paymentId, orderId}`) could not be told apart
  without inspecting which URL received them.

### Breaking — deployment

**Migrations are gone. `npm run db:sync` replaces them.** The contract is untouched, so no
generated client is affected — but every deployment pipeline that ran `db:migrate:up` must change.

| Before                                     | After                                                |
| ------------------------------------------ | ---------------------------------------------------- |
| `db:migrate:up` / `:down` / `:status`      | `db:sync` (`-- --check` to plan only)                |
| `gen:migrations`, `db/migrations/`         | nothing — indexes come straight from `model.ts`      |
| `src/modules/<m>/migrations/*.js`          | a one-off script under `ops/`, deleted after it runs |
| `migrations:` on the module manifest       | removed                                              |
| `migrate-mongo`, `migrate-mongo-config.js` | removed                                              |

An index is derivable from the domain model, so it is declared once — on the schema — and
reconciled on every deploy rather than recorded as applied by filename. That gap is what forced a
newly declared index to also be written by hand as a migration; there is now one author and no
second copy. Data changes that are NOT derivable (a rename, a backfill, a de-duplication) are
ordinary one-shot scripts under `ops/`.

Two behaviours improve as a side effect: `db:sync` drops indexes no schema declares, and it applies
a changed TTL `expireAfterSeconds` by rebuilding the index — which previously required a manual
`collMod` and, on a restart, failed the boot outright.

See [Data](docs/reference/data.md).

### Breaking — tooling

**The demo control surface is one prefix, `/__test/*`.** It had drifted to two — `/__demo/reset`
was renamed `POST /__test/restore` without updating the paired frontend's own call sites, which is
corrected here rather than left standing.

| Before                              | After                                                                                                          |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `POST /__demo/reset`                | `POST /__test/restore { scenario?: 'shop' \| 'blank' }`                                                        |
| `GET /__demo/emails`                | `GET /__test/emails`                                                                                           |
| `db:seed` / `db:seed:reset`         | `scenario:apply` / `scenario:apply:reset`                                                                      |
| `seed:export`, `check:seed-export`  | gone — nothing publishes a dataset file; `tests/integration/scenarios/shop.test.ts` checks conformance instead |
| `db/demo/demo-data.json`, committed | gone — `scenarios/subjects.ts` (ids and credentials only) is what survives                                     |
| the `translator` account            | folded into `editor`                                                                                           |

Also fixed in the same pass: `POST /__test/restore` used to drop the database, which cleared every
unique and TTL index along with the data until the process restarted. It now empties every
collection instead, and the demo tenant's `_id` is pinned so the cached deployment tenant id never
strands after a restore. See [Data](docs/reference/data.md).

**The demo shop is built by using the app, so `scenario:apply` is no longer idempotent.** Its
catalogue is still seeded, but its order book is produced by driving the real checkout, payment,
shipping and refund endpoints — which is not a thing that can be run twice over the same database
without giving the shop a second history. The seeder therefore refuses a database that already
holds anything, logs why, and exits 0 so a container boot's `db:bootstrap && <start>` still starts.
`npm run scenario:apply:reset` is how you rebuild on purpose. It also boots the application
in-process now (on an ephemeral loopback port, never `NODE_PORT`), since the flows only exist
behind the real middleware stack.

| Before                                      | After                                                                                               |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `scenario:apply` upserts, always safe       | refuses a non-empty database; `--reset` empties first                                               |
| order ids pinned in `scenarios/subjects.ts` | minted at build time; ask `GET /__test/scenario`, or chain a list request                           |
| —                                           | `GET /__test/scenario` serves the scenario name, the seed logins, and a row id per guarantee name   |
| —                                           | `scenario:apply --describe-to=<file>` writes that same JSON, for a live backend with no `/__test/*` |
| `POST /__test/restore` reseeds              | replays the copy this process built at boot — ~12 ms for `shop`, down from 0.58 s                   |

See [Demo profile](docs/tools/demo-profile.md#how-a-scenario-is-built).

**`npm run seed:images` is `npm run scenario:images`.** Scenario-only code moved out of `src/`
entirely (`scenarios/seed.ts`, `scenarios/accounts.ts`) and the two scripts that never shipped in
the production image moved from `scenarios/build/` to `scenarios/run-server.ts` and
`scenarios/tools/generate-seed-images.ts` — the rename follows that move, since "build" stopped
describing either one. `npm run demo`, `scenario:apply` and `scenario:apply --reset` keep their
names and behaviour.

### Breaking — security

**The demo profile no longer mounts on `NODE_DEMO`.** The env var alone, on any non-production
host, switched on an unauthenticated database wipe, mail diverted from SMTP, the fake OAuth
provider and a skipped boot secrets gate. `npm run demo` now calls `enableDemoProfile()`
in-process instead — the only call site in the codebase, so no copied `.env` can trigger it.
`NODE_DEMO` is gone from `.env-example`; nothing replaces it.

**The demo profile binds `127.0.0.1`, not every interface.** Its tokens are signed with a public,
hard-coded secret. `NODE_HOST` overrides it, the same way as `NODE_PORT`.

**`scenario:apply` refuses to run outside development/test when a seed account is still its
public fallback password**, not only in production. A staging seed, a CI job, or the paired
frontend's live e2e must set every `NODE_SEED_*_PASSWORD` first, or the seed silently no-ops.

**The dev compose's app port and its Mongo port (which runs no authentication at all) publish on
`127.0.0.1` by default**, not every interface. `NODE_HOST` overrides both, the same variable as
the demo profile's own bind above.

A dev volume created before this change still carries the pre-rename `translator` role and its
account (see the `translator` → `editor` fold above) — `upsertById` skips a row whose `_id`
already exists, so a boot with no `--reset` never repairs it. Dev volumes are disposable:
`docker compose down -v` and the next boot seeds clean.

### Breaking — authorization

**Every permission key is spelled `<family>.<breadth>.<action>` now, breadth always written.**
`orders.read` was ambiguous about whose orders; `orders.self.read` and `orders.any.read` are two
different keys, and a role states which one it holds instead of reaching a wider read through the
family's `manage` wildcard — which is also gone, 12 keys, one per family. The defect this forces a
fix for: the support desk and the warehouse could not read an order or a payment that was never
their own without also being handed `orders.manage`'s delete. `orders.any.read` and
`payments.any.read` say "read everyone's, change nothing" directly.

| Before                                                                  | After                                                                                                                                    |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `orders.read` / `payments.read` (own rows only)                         | `orders.self.read` / `payments.self.read` — same condition, new name                                                                     |
| `orders.manage` / `payments.manage` / 10 other per-family `manage` keys | gone — every role that held one now holds the concrete keys it always reduced to, spelled `any`                                          |
| no way to read every order without also holding delete                  | `orders.any.read` / `payments.any.read` — new, unconditional, granted to `support` and `warehouse`                                       |
| `inventory.manage` (guarded `POST /inventory/reservations/sweep`)       | `inventory.any.sweep` — a new action, since CRUD has no verb for the expiry tick; granted to nobody, reachable only through `all.manage` |

A shop that edited its own roles holds the old spellings in its `roles` collection —
`ops/data/20260914000000-authz-key-standard-migration.ts` rewrites every stored document, renamed
keys one-for-one and deleted `manage` keys into the exact concrete set they used to expand to. No
role's actual capability changes, except the two the fix targets. `GET /account/abilities` and the
generated client are unaffected: `permissions` was already `string[]`, never an enum. See
[Authorization](docs/theory/authorization.md#the-key-grammar-and-the-invariant-it-exists-for).

### Added

- **`POST /account/password/check`** — unauthenticated, advisory-only breach lookup for a
  candidate password (a bundled list, then the HIBP k-anonymity range API), so a signup form can
  warn before the account exists. Additive; the four password-SET paths enforce the same two
  checks server-side regardless of what this endpoint answers.

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

### Breaking — contract

- **`analyticsConsent` is a `boolean`.** It was `enum: [granted, denied]` on `User`,
  `UpdateAccountRequest` and `UpdateAccountRequestMultipart`; the tri-state it modelled had no
  third state, since an absent value and `denied` were always treated alike. A generated client
  cannot absorb this without being regenerated. The migration backfills existing rows —
  `granted` → `true`, `denied` and absent → `false` — and `analyticsConsent` no longer reaches
  `updateProfile` from a request body at all: the field was dead on the self-service path
  regardless of type, and is reachable only through the admin `/users` route.

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
- **Anti-automation ladder**, three rungs guarding `POST /account/signup`, `POST /account/login`,
  `POST /account/reset` and `POST /feedback/contact` — all but the first off by default. Rung 1
  (identity, address and address-block rate budgets) is always on. Rung 2
  (`NODE_ANTIBOT_EMAIL_POLICY` — `off`/`disposable`/`mx`) refuses a known-disposable or unregistered
  email domain; a refused signup now answers `201` from a document that is never persisted, the
  same "file it, tell the bot nothing" shape `POST /feedback/contact` already used, rather than a
  `422` a script could read as a per-domain signal telling it to try the next one. Rung 3
  (`NODE_ANTIBOT_PROVIDER` — `none`/`altcha`/`turnstile`) gates a route behind a human-challenge
  token; on login it only engages once the per-account failure budget is at least half spent, never
  on an honest first attempt. `GET /antibot/config` now reports every rung's status
  (`rungs.identityBudgets`, `rungs.emailPolicy`) alongside rung 3's provider, which it already
  published — additive, so an existing client reading only `provider`/`parameters` is unaffected.

[3.0.0]: https://github.com/Guebbit/boilerplate-node-backend/releases/tag/v3.0.0
