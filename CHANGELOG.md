# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Checkout emails the customer what they bought.** `POST /cart/checkout` now dispatches the
  order-confirmation email that until now only the admin `POST /orders` path sent — and the email
  finally says something: `orderConfirmEmail` takes the order's lines and resolves one translated
  string per bought product plus a total (through `sumLineItems`, so the email quotes the number
  the order stands for — never a second sum). The dispatch lives in the checkout service rather
  than the controller, unlike every other email, because only the point past the conditional cart
  clear knows the order stood, and only there is the customer's record in scope: the email goes
  out in the recipient's language (`user.locale`), not the request's. A refused checkout sends
  nothing — "stock moved if and only if the order stands" now extends to the inbox.

- **`docs/theory/module-lifecycle.md` — adding and removing a domain as a procedure, not a
  measurement.** `modules.md` said what a domain costs and proved it; it never said what to type.
  The new page is the ordered procedure in both directions: the four registries and which three of
  them are conditional, the manifest, the fragment-plus-section-order step, the bundle, and the
  two-repo copy that ends both halves. It also states the rule for reading a deletion run — a break
  in `src/**` or `db/**` is the only real failure, everything under `tests/**` and `scripts/**` is a
  report, and two specific breaks are supposed to happen. It stays a written procedure rather than
  becoming a test on purpose, and the page says why: the four failure classes worth catching — a
  canary pinned to the module count, a mechanism spec using a domain as sample data, a domain-named
  export from a generated file, and a route addressed by name — are each invisible to a sweep. A
  whole-word scan for domain names was tried and rejected on the way: `observability` and `locales`
  are module names AND infrastructure folder names, and `db/migrations` names collections forever by
  design. `modules.md` keeps the reasoning and the scorecard, points here, and carries the standing
  reminder to run the exercise after any significant change.

- **The account is self-service now: `PUT /account`, `POST /account/password`, and the fix they
  carry.** The profile page saved through `PUT /users/{id}`, which sits behind `isAdmin` — so a
  normal user editing their own profile got a 403 from their own account. `PUT /account` is the
  self-service update (email, username, locale, image; never `admin`, `active` or `password` —
  role and account state stay with the admin endpoints), and `POST /account/password` changes the
  password by proving the current one. A wrong current password is a **422 with translated copy,
  not a 401**: a 401 from an authenticated endpoint reads as "session expired" to every client
  interceptor and would log the user out of a session that is perfectly valid. A duplicate email
  takes the same E11000 → 409 path signup takes, so the two flows cannot disagree about what
  "taken" looks like.

- **Sessions are visible and individually revocable: `GET /account/sessions`,
  `DELETE /account/sessions/{sessionId}`, `POST /account/logout`.** The refresh tokens were
  already one row per session (`jwtid` gave each its own identity); these endpoints finally read
  them. The listing exposes the subdocument id, the expiry and a `current` flag matched through
  the refresh cookie — **never the token value**, which is as good as a password. Revocation
  `$pull`s by that id, pinned to the caller's own document (someone else's session id answers the
  same 404 as an invented one) and to `type: refresh` (a pending reset/delete/verify token is not
  a session and the handle must not reach it). `POST /account/logout` is the single-session
  logout that was missing — `logout-all` was the only exit, so signing out on a shared machine
  killed the phone's session too. It works from the cookie alone, no bearer token, exactly like
  `GET /account/refresh` and for the same reason.

- **Email verification: `verified` on the `User`, `POST /account/verify-request` and
  `/account/verify-confirm`.** Signup issues a 24h one-time token and emails it (the copy already
  promised this: "confirm via email to login" has been in `signup.registration-successful` since
  before the flow existed); confirm spends the token atomically — same consume-decides-the-race
  shape as `reset-confirm` — and flips `verified`. Changing the email through `PUT /account`
  UNVERIFIES the account first, or one confirmed mailbox could launder any number of addresses.
  `verified` is **informational only**: no endpoint refuses an unverified account, clients render
  a banner rather than a wall. Admin-created users start `true` (an operator vouches for the
  address they typed), self-signups start `false`, and existing rows are grandfathered to `true`
  by `db/migrations/20260813090000-user-verified-column.js` — they predate the flow, and nagging
  the longest-standing accounts first is the wrong reading of a new column.

- **The filter chips have an endpoint: `GET /products/categories`.** Categories and tags with
  counts, in one `$facet` aggregation so both lists describe the same instant of the collection.
  Counts follow `publicScope` — a category held only by hidden or soft-deleted products does not
  exist to the storefront, because a chip that finds nothing is worse than no chip — and the
  response is cached under the products tag, so every write that changes the catalogue refreshes
  the chips with it. The seed products now carry categories and tags (they never had any), which
  is also what makes the search's existing `category`/`tag` filters demonstrable at last.

- **An address book, and orders that remember where they were going:
  `GET/POST /account/addresses`, `PUT/DELETE /account/addresses/{addressId}`,
  `Order.shippingAddress`.** One collection keyed by `userId` (the cart's pattern, for the cart's
  reasons), owned by `account` — the first collection that module owns, and its manifest now says
  so. One invariant carries the CRUD: a non-empty book has EXACTLY ONE default, whichever write
  got it there — the first entry claims it, `default: true` steals it, removing the holder
  promotes the oldest survivor, and `default: false` is deliberately not a demotion (a book with
  no default would make checkout's "ship to the default" a coin flip). Checkout accepts an
  optional `addressId`, resolves it BEFORE any stock moves — a stale id refuses the whole
  checkout with `CART_ADDRESS_NOT_FOUND` rather than shipping nowhere — and embeds a SNAPSHOT
  (`OrderAddress`: the shipment's fields, none of the book's), exactly as the items embed product
  snapshots. No address is required to buy: an empty book simply produces an order without one.
  The barrel exports exactly one thing for it (`addressForCheckout`); the CRUD stays behind the
  module's own routes, and a destroyed account takes its book with it via `user.deleted`.

- **Products have stock, and checkout finally has a realistic way to fail.** `Product.stock`
  (integer, `minimum: 0`, demo default `100` — declared on the create bodies for the same reason
  `active`'s is) is decremented by checkout and by the admin order create, and restored by a
  customer cancel. The decrement is CONDITIONAL — `stock: { $gte: quantity }` rides in the
  update's filter — so two checkouts racing the last unit resolve at the storage layer instead of
  overselling; a multi-line checkout that fails one line puts back what earlier lines took, and
  the checkout that loses the cart-changed race restores its units alongside retracting its
  order. The invariant, tested from both directions: **stock moves if and only if the order
  stands.** Pre-flight, `evaluateCheckout` gains an `insufficient-stock` verdict
  (`CART_INSUFFICIENT_STOCK` on the wire, `ORDER_INSUFFICIENT_STOCK` from the admin path); the
  routes that move stock invalidate the products cache so the storefront's counts follow. A sale
  is written with `timestamps: false` — `updatedAt` keeps meaning "the catalogue entry changed".
  Existing rows are backfilled to `100` by `db/migrations/20260813091000-product-stock-column.js`;
  one seed product now sits at `stock: 0` so the out-of-stock badge and the checkout refusal have
  something to demonstrate. Deliberately NOT coupled: the admin status/items edit and the hard
  delete move no stock — an admin correcting a record is not a sale.

- **A tenth module: `wishlist`.** One document per user like the cart, but a line is
  `{ productId }` alone — a wishlist answers "do I want this", not "how many", so `$addToSet` is
  the entire idempotence story and the cart's retried two-step upsert has no race to close here.
  `GET /wishlist`, `POST /wishlist` (public-catalogue products only, double-click-safe),
  `DELETE /wishlist/{productId}`, and the exit: `POST /wishlist/{productId}/move-to-cart`, which
  writes the cart line BEFORE dropping the saved one so a failure part-way leaves the product
  saved rather than lost. Subscribes to `product.deleted` and `user.deleted` exactly as the cart
  does; seeds its own fixtures through a new `seed-identities` fragment; three analytics events
  tie the save funnel to the purchase funnel (`wishlist_item_added`, `wishlist_item_removed`,
  `wishlist_moved_to_cart`). Also the first module added since the registry existed — the whole
  footprint is one folder plus one line in `src/modules.ts` and three section-order entries in
  `scripts/contracts/`, which is the deletability claim exercised in the other direction.

- **Customers act on their own orders: `POST /orders/{id}/cancel` and
  `POST /cart/reorder/{orderId}`.** Every order write used to be `isAdmin`, so the storefront half
  of the app could create orders and then only watch them. Cancel is the narrow write — `pending`
  only, because `paid` money travels back and `shipped` is a return, each a flow of its own that
  an admin drives through the status write — and the gate rides IN the update's filter with the
  caller's scope, so a cancel racing the admin's "shipped" (or its own double-click) resolves at
  the storage layer with exactly one winner; the follow-up read only chooses between 404 and the
  `ORDER_NOT_CANCELLABLE` 409. Reorder is filed under **cart**, not orders, because of what it
  writes: the order is only read, and `cart → orders` is the arrow the manifests already declare.
  It re-resolves the order's product snapshots against today's catalogue through `publicScope` —
  vanished, deactivated and hidden products are skipped, the returned cart view is the record of
  what landed, and an order with nothing left answers `REORDER_UNAVAILABLE` rather than a hollow 200. Both audited (`user.order.cancelled`, `user.cart.reordered`) and in the analytics funnel
  (`order_cancelled`, `cart_reordered`).

### Changed

- **The npm scripts were consolidated.** `genapi`/`genasyncapi` are `gen:api`/`gen:asyncapi`; the
  `podman:*`/`docker:*` families collapsed into one `compose` runner (`scripts/compose.ts` picks
  the engine); the `:host` variants collapsed into one `host` prefix runner (`npm run host
db:seed`); `load:test*` became `test:load*`, keeping everything test-shaped under the `test:`
  prefix; `test:prism` is a real script (`scripts/prism-smoke.ts`) instead of a shell one-liner;
  and `build` is `ts-check && lint` with the `build-only` indirection gone.

- **`views/` and `contracts/shared/` became `shared/views/` and `shared/contracts/`, and the email
  templates carry the module that owns them in the filename.** The repo root held two folders that
  meant the same thing — assets no module owns — under two names, and one of them said it twice
  (`contracts/shared`). One `shared/` now holds both, which leaves the ownership axis reading the
  same way everywhere: a module owns its slice, `shared/` holds what no module can. The templates
  went from `email-order-confirm.ejs` to `orders.order-confirm.ejs`: the old prefix repeated the
  directory, the new one names the owner, so a template orphaned by a deleted module is visible on
  sight rather than only at the point `mailer-templates.test.ts` compares the copy map against the
  directory listing. They stay in ONE flat directory rather than moving into their modules on
  purpose — `templateName` crosses RabbitMQ to a consumer that may be another process, and a bare
  name resolved against that consumer's own `EMAIL_TEMPLATES_DIR` stays portable where a path into
  `src/modules` would bind the payload to one checkout's layout. So the AsyncAPI contract is
  untouched, the queue needs no drain, and no `include` in any template changed.

- **`tests/unit/i18n/user-locale.test.ts` → `src/modules/account/tests/unit/persisted-locale.test.ts`.**
  It reached `@modules/account/service` and `@modules/users/service` — a module's internals, which
  production code may not import either. Signup is what captures the persisted locale and signup
  lives behind `account`'s routes, so the spec belongs to `account`; its edits now go through the
  `users` barrel, which is the same surface `account` uses in production. Filed here rather than
  under Fixed because nothing was broken — the spec passed where it stood, it just made `users` and
  `account` harder to delete, which is the residue a deletability run exists to surface.

- **The three client collections left `.dev/` for the repo root — `contract.bruno.yml`,
  `contract.insomnia.json`, `contract.mockoon.json` — and are no longer shared files: the frontend
  holds no copy and the identity gate is 8 files, not 11.** The root because they are the contract
  rendered for each tool and belong beside the document they are derived from; a dotfolder is
  where things go to be forgotten, and `.dev/` is exactly where the hand-written versions rotted
  unnoticed. Their identity entries defended against
  hand-maintained restatements forking, and they are not hand-maintained any more: the backend
  generates them from `openapi.yaml` and pins them to a fresh generation in
  `contract-bundles.test.ts`, while `openapi.yaml` itself stays identity-checked — identical spec
  plus deterministic generator means a frontend copy could never disagree without the spec
  disagreeing first. Nothing in the frontend ever read them (its mocking is MSW, its API layer is
  orval), so each copy was pure carrying cost: one more file to sync on every contract change.
  Here they are NOT deprecated — they are the published output the fragment pipeline exists to
  produce, committed like `openapi.yaml` itself. `readCommittedBundle` now reads an absent output
  as stale-and-rewrite instead of crashing, which is what a renamed bundle output turns out to
  need.

### Fixed

- **`contracts:bundle` ran its two steps in the wrong order** — collections generated from
  `openapi.yaml` BEFORE the bundle rebuilt it, so any contract change failed the run (or worse,
  regenerated collections one edit behind). This was fix #6 on `DELETABILITY_TEST.md`'s ranked
  list. The fix ended up in the bundler rather than in the npm script: a bundle declares
  `generated: true` when its own fragments derive from another bundle's output, and a full run
  assembles every authored bundle first, regenerates the collection fragments from the fresh
  `openapi.yaml`, then assembles the generated three. `readCommittedBundle` also reads an absent
  output as stale-and-rewrite instead of crashing — a renamed output is the definition of stale,
  and crashing there turns the one command that would fix the state into the one that cannot
  run.

## [2.0.0] - 2026-08-13

The modular release, and the first one cut. Everything below is a single arc told in waves —
separated by `---`, newest first, each with its own preamble: a layered single-app layout became
nine self-registering modules over a four-tier substrate (`infrastructure`, `kernel`, `app`,
`modules`); the shared contracts became per-module fragments assembled into committed bundles; and
every derived artefact — client collections, seed identities, analytics events, realtime types —
is generated from those bundles rather than maintained by hand. The measurement that the
architecture delivers what it promises is `DELETABILITY_TEST.md`. A wave's "Known issues" records
what was true when that wave closed; later waves above it document the fixes.

### ⚠ Breaking

- **Modules may now carry a `domain/` folder: pure business rules, lint-guaranteed framework-free.**
  Nothing in `src/modules/*/domain/**` may import mongoose, express, any tier alias, a sibling
  module, or its own module's outer files — so a rule cannot quietly acquire a dependency on how it
  is stored or delivered. `orders/domain/` holds `totals.ts` (moved from `orders/totals.ts`) plus a
  new `rules.ts`; `cart/domain/` holds the checkout verdict.

    The shape is **return a verdict, not a rejection**: `checkOrderLines()` answers `no-lines` or
    `product-missing` and knows nothing of 422, 404 or i18n, while `service.ts` maps the verdict to an
    envelope. Same for `evaluateCheckout()` in cart. The behaviour of both is unchanged — they were
    extracted from where they already ran.

    The folder is **optional**, and most modules do not have one. It also has a **floor**: a rule
    earns a place only if it has more than one caller or a non-obvious failure mode. A one-line
    expression with a single caller stays inlined, with its comment. See
    `docs/theory/domain-layer.md` for both halves of that test, and `DDD_EXPLORATION.md` for what it
    would take to go to full tactical DDD, costed — neither of which is implemented.

- **The two substrate tiers were renamed: `src/core` → `src/infrastructure`, `src/platform` →
  `src/kernel`.** Aliases follow: `@core/*` → `@infrastructure/*`, `@platform/*` → `@kernel/*`. Nothing about
  the dependency rule changed — the same four tiers, the same arrows, the same per-tier lint blocks
  — only the two names that were carrying the wrong meaning.

    `core` was the problem name. It is not unusual, it is **overloaded**: Nest and Angular use it for
    the DI container, Spring and Backstage for the substrate, and this repo for the substrate, which
    meant `docs/theory/modules.md` had to carry a standing disclaimer that `core` did not mean what a
    reader arriving from Nest would assume. A novel name makes someone look it up; an overloaded one
    makes them think they already know, and that failure is silent. `infrastructure` is the hexagonal
    term for exactly what the folder holds — adapters, HTTP plumbing, persistence, runtime — and needs
    no disclaimer. `common` and `base` were rejected for describing nothing, which is how the old
    `src/utils/` became a dumping ground.

    `platform` moved for a weaker but real reason: in current usage the word means the base layer
    everything runs on (platform engineering), which is this repo's `infrastructure` — so the two old
    names read as pointing at each other's contents. The four files under it are a **microkernel**: a
    small fixed host that loads, validates and connects plugins it has never heard of. `kernel` says
    that; VS Code's `vs/platform` precedent was weighed and is a _service/DI layer_, a third meaning
    again. Full reasoning in `docs/theory/modules.md`, "Why these names".

- **`core/totals.ts` is now `modules/orders/totals.ts`**, exported from the orders barrel. Line-item
  money — sum, rounding, what a missing price counts as — is a business rule, and the substrate tier
  holds none: it is what the application runs ON, and none of it knows what a price is. It had been
  pushed down because two modules needed it, which is the pressure that erodes this kind of tier over
  time. The owning question is not "who uses it" but "whose rule is it": a cart summary is a preview
  of the total checkout will charge, so the number is orders' to define and cart's to display. `cart`
  already declared `dependsOn: ['orders']`. Renaming the tier is what made the leak obvious.

- **`modules/cart/service.ts` is now `modules/cart/services/`** — `view.ts`, `items.ts`,
  `checkout.ts`, `cleanup.ts` and a barrel. Import sites move from `../service` to `../services`;
  `cartService` and every named export are unchanged. This is a size rule, now written down in
  `docs/theory/layers.md`: a module's service stays one file until roughly 300 lines, then becomes a
  `services/` folder split by what the operations do. Cart was the only module past the threshold.

- **Products and cart are modules; their layer files moved.** `@models/products`,
  `@repositories/products`, `@services/products`, `@controllers/products/*` and `src/routes/products.ts`
  are now `src/modules/products/` — `model.ts`, `repository.ts`, `service.ts`, `controllers/*`,
  `routes.ts` — reachable only through the barrel `@modules/products`. The same for carts under
  `@modules/cart`. A module declares its own mount point in `module.ts` and is enabled by one line
  in `src/modules.ts`; `src/bootstrap/routes.ts` no longer names either domain. Lint rejects an
  import of another module's internals.

- **The persistence substrate moved into `core`.** `@models/serialize` → `@infrastructure/persistence/serialize`,
  `@repositories/base` → `@infrastructure/persistence/base-repository`, `@repositories/search` →
  `@infrastructure/persistence/search`. All three only ever imported mongoose; leaving them in the layer
  directories would have made every module import a layer to reach them.

- **Deleting a product emits `product.deleted` instead of calling the cart service.** The catalogue
  and the cart referenced each other — `productService.remove` emptied carts while the cart priced
  lines from the catalogue — which is a cycle no dependency graph can express. Products now emits
  and the cart module subscribes, so the arrow points cart → products only. Handlers are awaited, so
  the cart is still emptied before the row disappears; a handler that throws is logged and does not
  fail the delete.

- **`rejectResponse` and `generateReject` no longer take a `message`.** The envelope's `message` is
  derived from the status by `resolveErrorMessage`, so a given status always reads the same way:
  `rejectResponse(response, 404, [t('…')])`. Two conventions had coexisted — a bare `'Not Found'`
  and an operation-prefixed `'getProductItem - not found'` — and the prefix leaked the handler
  layout into every 404. Clients must branch on `errors[].code`, as they always should have; the
  wording of `message` changed on every error response (a 422 now reads `Unprocessable Entity`).

    `rejectDatabaseError` followed the same convention and so changed too: the interpreter's detail
    (`Invalid identifier`, a driver message) is now written to the log alongside the operation name
    instead of into the response body.

- **`readInput` takes a `surface`, not a `sources` array.** A route declares which surface it is —
  `search`, `write`, `delete`, `path` — and `SURFACE_SOURCES` maps that to the sources and their
  precedence. The sources themselves are unchanged. Twelve call sites had been spelling the array
  by hand; they agreed, but nothing required it, and a precedence order chosen by whoever wrote the
  newest controller is a rule nothing records. A fifth combination now has to be added deliberately.

- **`productService.updateById` returns a reject envelope instead of throwing `Error('404')`.** The
  user and order services already reported a missing record this way. Throwing forced its one
  caller to recognise the case by string-matching `error.message`, where a genuine database failure
  and a missing row were indistinguishable.

- **`userService.adminCreate` / `adminUpdate` / `adminUpdateById` are now `create` / `update` /
  `updateById`,** matching the product and order services.

- **`isAdmin` answers 401, not 403, when the request carries no credentials.** 401 means
  "authenticate and retry", which a client acts on by redirecting to login; 403 means "you are
  known and still refused". Answering 403 sent an expired admin session to the error page instead
  of the login page. Unreachable through the current routes, which all mount `isAuth` first — which
  is why it went unnoticed. A known non-admin still gets 403.

- **`handleUncaughtError` moved from `src/app.ts` to `src/bootstrap/error-handling.ts`.**

- **`AnalyticsEvent` (enum) is now `analyticsEvents` (const object).** Values are unchanged;
  `AnalyticsEvent.PRODUCTS_SEARCHED` becomes `analyticsEvents.PRODUCTS_SEARCHED`. It has to be an
  object rather than an enum because the file is shared byte-for-byte with the frontend, whose lint
  config requires enums to be `E`-prefixed while this one does not.

- **`DELETE /orders/{id}` soft-deletes instead of destroying the record.** Orders previously had
  no soft delete at all — `removeById` took no flag and the model had no `deletedAt` — while
  products and users had both. A delete that used to be permanent now sets `deletedAt`; pass
  `?hardDelete=true`, a `{"hardDelete": true}` body, or the new `DELETE /orders/{id}/hard` to get
  the old behaviour. Calling the soft form twice **restores** the order, matching products.

    This is the multi-spelling delete surface applied to every domain that owns a persisted
    record, rather than to two of the three. Cart and feedback stay exempt: their records are not
    entities worth keeping after deletion, and that is now stated in the descriptor rather than
    implied by an absent route. See `docs/theory/request-input.md`.

- **A non-admin can no longer read their own soft-deleted orders.** `callerScope` composes two
  axes now — `ownerScope` answers "whose", `deletedAt: { $exists: false }` answers "still there".
  Admins pass no scope and so still see everything. A soft-deleted order answers **404**, not 403:
  its existence is not disclosed, the same rule the product item route already followed.

- **`postOrders` and `putOrders` are one `writeOrders` controller.** `POST /orders`,
  `PUT /orders` and `PUT /orders/:id` now reach a single handler that branches on whether an id
  was found, exactly as `writeProducts` and `writeUsers` already did. No route, payload or status
  code changed; the three operationIds are unchanged.

- **`ecommerce.order-deleted` is replaced by `order-hard-deleted` and `order-soft-deleted`** in
  all three locale files, since the operation now has two outcomes to name.

### Added

- **`DELETABILITY_TEST.md` — the acceptance test the modular layout exists to pass, actually run.**
  Two throwaway copies of the working tree: three domains removed (`products`, `cart`, `orders`),
  then a tenth added. The claim under test — deleting a domain is `rm -rf` of one folder plus one
  registry line, and `complete:check` stays green — holds for `src/**` and fails in exactly seven
  places, all of them test or script code, every one the same mistake in a different costume: a
  count or a name that was easier to write down than to derive. The document records what broke by
  class, a ranked fix list, and the commands to re-run the measurement — anything that fails and is
  not on the list is coupling that arrived later.

- **`docs/theory/known-gaps.md` — what is deliberately unfinished, written down.** Barrel exports
  nobody imports (the `feedback` barrel entirely), the coverage floors still keyed to the
  pre-migration layout (§4, which `jest.config.js` now points at), and the rest of what the
  migration chose not to resolve — each with enough context to act on later without re-deriving
  it, and dated so a future reader knows to re-verify before trusting it.

- **The three API client collections are generated from the contract.** They were hand-written
  restatements of `openapi.yaml` and had rotted: Bruno and Mockoon each covered 37 of the contract's
  56 operations and named no `feedback`, `locales` or `observability` endpoint, while 30 of
  Insomnia's 39 requests pointed at URLs the application stopped serving (`POST /products/add`,
  `GET /products/details/{id}`, `GET /heavy`). Mockoon's bodies predated the response envelope, so
  it mocked a bare user for `GET /account` where the API returns `UserEnvelope` and every error body
  was the old `{ success, error, traceId }` shape — a mock server serving what the frontend cannot
  parse.

    `scripts/contracts/generateCollections.ts` now writes their per-module fragments:
    shapes from `openapi.yaml`, values from `seed-identities.ts` (so `GET /products/{id}` asks for a
    product the database holds and `POST /account/login` sends credentials that work), and ownership
    from the OpenAPI fragments, so the module → path mapping stays recorded once. Identifiers are
    hashed from method and path rather than generated fresh, so a regeneration rewrites only what
    changed. All three now carry all 56 operations, and two assertions keep them there: the
    committed fragments must equal a fresh run, and each collection must hold one request per
    declared operation.

    **What a contract cannot describe now has a home: `src/modules/<name>/dev/probes.yml`.** A
    collection is also where the requests that prove the API _rejects_ things live, and a spec
    describes valid calls, so no generator can derive them. 14 probes are declared as data and
    generated into Bruno and Insomnia (not Mockoon — a mock server answers requests, it does not
    send them): a non-admin login, a bogus token, a duplicate signup, the rate limiter, a body that
    breaks two constraints, `Accept-Language: it`, every optional filter at once, the soft-deleted
    and the inactive product, checkout on an empty cart, an unowned product id, a zero quantity,
    and the two order-scoping cases the seed dataset exists to make reachable. They refer to seed
    records as `{{seedSoftDeletedProductId}}` — derived, never pasted — so a fixture that changes
    takes its probe with it.

- **Every shared, domain-shaped document is assembled from per-module fragments.** Seven files
  exist in both this repo and the paired frontend and list every domain the app has: `openapi.yaml`,
  `asyncapi.yaml`, `src/infrastructure/observability/analytics-events.ts`, `db/seeds/seed-identities.ts` and
  the three `.dev/` API client collections. Each is now a bundle: a module owns its slice —
  `openapi/`, `asyncapi/`, `analytics.fragment.ts`, `seed-identities.fragment.ts`, `dev/` — and
  `npm run contracts:bundle` concatenates them into the committed document that spectral, orval,
  Prism, the seed runner, Bruno, Insomnia and Mockoon all read. Deleting a domain deletes its
  endpoints, its events, its analytics names, its demo records and its saved requests with it.

    The bundler never parses. `openapi.yaml` alone carries 149 comment lines that a `js-yaml` round
    trip drops (3453 lines out of 3062, zero comments), and the bundle has to stay byte-identical
    with the frontend's copy — so a fragment is a verbatim slice of the original lines and bundling
    is string concatenation. The one exception is list separators: JSON arrays and TypeScript object
    literals need a comma between slices and none after the last, so those fragments are joined
    rather than pasted, which keeps a module fragment from having to know whether it is last.

    `scripts/contracts/` holds the registry, `npm run check:contracts-bundle` reports staleness, and
    `tests/cross-cutting/contract-bundles.test.ts` asserts every bundle equals its committed file on
    every run. The frontend authors none of them and receives finished files, as it already did for
    `openapi.yaml`.

- **`src/kernel/registry.ts` — the module registry.** `src/modules.ts` lists the enabled modules;
  the registry validates them before anything is mounted. A duplicate name, a dependency that is
  not enabled, or a dependency cycle stops the boot with the offending path named, instead of
  surfacing as a 500 on whichever request first crosses the gap. Adding a domain is one folder plus
  one line; removing one is `rm -rf` plus deleting that line.

- **`src/kernel/events.ts` — domain events.** The sanctioned channel for two modules that cannot
  own each other. Modules declare their own events by augmenting `IDomainEventMap` from inside
  their own folder, so the catalogue grows with the domains that own it and no shared file
  enumerates them. Handlers are awaited in registration order; a throwing handler is logged and
  does not fail the emitter, because a listener must not roll back an operation it never authorised.

- **`src/bootstrap/`** — six named installs (`installSecurity`, `installRequestContext`,
  `installTelemetry`, `installStatic`, `installRoutes`, `installErrorHandling`) that `app.ts` calls
  in order. It sits outside `src/infrastructure/**` because these mount middleware and
  `no-restricted-imports` forbids core from importing `@middlewares/*`; it is the assembly layer,
  the only place allowed to reach both. See `docs/theory/layers.md`.

- **`src/infrastructure/observability/analytics-events.ts`** — the analytics event names both repos emit,
  byte-identical with the frontend's `src/stores/analyticsEvents.ts` and guarded by
  `check:spec-identity`. A name that existed on one side only produced two half-events that no
  funnel added up, and nothing detected it.

- **`rejectDatabaseEnvelope(context, error)`** in `@infrastructure/http/errors` — the counterpart to
  `rejectDatabaseError` for services, which report failure by _returning_ an envelope and so have
  no `Response` to send. Six `.catch` handlers had each re-derived the status inline and dropped the
  interpreter's detail.

- **`tests/unit/controllers/every-controller-catches.test.ts`** — a structural guard asserting no
  controller starts a promise chain without handling rejection. It covers controllers that do not
  exist yet, which per-controller fixtures would not.

- A case for `publicRoot`'s `./public` fallback in `image-store.test.ts`. Every other case sets
  `NODE_PUBLIC_PATH`, reasonably, which left the default itself unexercised — nothing
  distinguished `'public'` from any other string. It moves the working directory rather than
  writing into the repository's own `public/`, since the fallback is relative.

- Locale keys `ecommerce.cart-empty`, `ecommerce.cart-product-unavailable` and
  `generic.error-not-found`, in all three dictionaries.

- **`tests/contract/request-sources.test.ts`** — asserts that every controller's `readInput`
  declaration is a subset of the sources `openapi.yaml` allows for the routes it serves, that
  every mounted route exists in the spec, and that every spec operation is mounted. The route
  table is recovered statically from `src/bootstrap/routes.ts` and `src/routes/*.ts`; no
  server is booted.
  `docs/theory/request-input.md` had proposed this test and listed five contract bugs found by
  doing the comparison by hand; it reproduces all five.

- **`db/migrations/20260810120000-orders-soft-delete.js`** — the `orders_userId_deletedAt` index.
  No data backfill: `visibleScope` tests `$exists: false`, so every existing order is already in
  the right state and writing an explicit null would make all of them look soft-deleted.

- A soft-deleted order in `db/seeds/seed-identities.ts`, on the non-admin user, so the "owner
  cannot see their own soft-deleted order" branch has a fixture behind it.

### Changed

- **`docker-compose.yml` passes the two rate-limit budgets through as variables** —
  `NODE_RATE_LIMIT_MAX` (default 100) and `NODE_AUTH_RATE_LIMIT_MAX` (default 10). A live E2E run
  drives the whole paired frontend suite from a single address and exceeds both, at which point the
  API answers 429 and the failures read as "login is broken" rather than "out of allowance". A run
  can now raise them from the shell (`NODE_RATE_LIMIT_MAX=1000 NODE_AUTH_RATE_LIMIT_MAX=1000
npm run podman:restart`) instead of editing `.env`; an ordinary `up` is unchanged, and the two
  buckets stay decoupled so widening the global one never cheapens password guessing.

- **Mutation testing reset onto the module layout.** `stryker.config.json`'s `mutate` still listed
  `src/services/**`, `src/models/**`, `src/repositories/**`, `src/middlewares/**` and `src/jobs/**` —
  five globs matching nothing since the migration — and excluded `src/infrastructure/bootstrap/**`, which is
  now `src/infrastructure/runtime/**`. It is now `core` (less `runtime/**` and the OTel tracer), `app`,
  `platform` and every module's own `.ts`, less each module's barrel, `module.ts`, `seeds.ts`,
  `controllers/` and `tests/`: 92 files, with every glob verified to match something. Controllers
  stay out for the reason they always did — only the unit suite runs under Stryker, so every
  controller mutant would survive and the ratchet would then defend those zeros forever.

    Keeping them out needed a second fix, found by running the dry run rather than by reading the
    config: `testPathIgnorePatterns` excluded `tests/contract/` but not the co-located
    `src/modules/<name>/tests/contract/`, so those suites were still collected and Stryker aborted
    with "There were failed tests in the initial test run" — they drive the real app over HTTP and
    have no database in the sandbox. Contract tests have had two homes since the migration; the
    ignore list now covers both.

    `mutation-baseline.json` is **deleted rather than rewritten**. It keyed every migrated file by
    its pre-migration path, and `check-mutation-baseline.ts` already seeds a fresh baseline when the
    file is absent, so hand-editing it would have been inventing per-file scores for a scope nothing
    has measured. `break` is `null` for the same reason: the old `60` came from a population that no
    longer exists. The first full run supplies both, in that order — `npm run test:mutation`, then
    `npm run test:mutation:check`, which now exits 0 instead of failing on stale keys.

    The config's notes lost the superseded "current state" run figures and now carry only reasoning
    that still applies; `docs/tools/mutation-testing.md` was un-frozen and matches, and
    `jest.config.js` no longer claims its coverage keys mirror `mutate` exactly — they were never
    going to, since a file with no coverage is free to mutate and expensive to floor. Stryker
    itself, the ratchet scripts and the nightly workflow are untouched.

- **`src/app.ts` is 138 lines, down from 442.** It now reads as the middleware stack in the order a
  request travels it, with the four load-bearing dependencies between groups stated once above the
  sequence. Middleware order _is_ behaviour, and it had been 442 lines of interleaved config you had
  to read start-to-finish to verify. `startServer`/`stopServer` stay: the boot chain is one real
  dependency ordering. The trust-proxy, `express.static` and error-handler docblocks moved verbatim.

- **The i18n guard also checks `generateReject`.** It only ever inspected `rejectResponse`, so half
  the API's user-facing copy was unguarded — services return envelopes rather than sending them.
  Extending it immediately found an untranslated literal (below).

- **`check:spec-identity` covers eleven shared files, not three.** It guarded `openapi.yaml`,
  `asyncapi.yaml` and `spectral.yaml`; it now also guards `db/seeds/seed-identities.ts`, the
  generated realtime types, the three `.dev/` API client collections, and
  `scripts/check-mutation-baseline.ts` / `scripts/gen-asyncapi-types.ts`, and the shared
  analytics event names.

    The omissions were structural rather than an oversight: `SHARED_SPEC_FILES` was a list of
    **names**, compared at the same relative path in both repos, so any file living at a different
    path in each was uncheckable by construction. `SHARED_FILES` is a list of **path pairs**, and a
    per-repo `THIS_REPO` constant decides which side this checkout is — the only line that differs
    from the frontend's copy of the module.

    `seed-identities.ts` is the reason it matters: a fork there leaves both repos green, because
    each is consistent with its own copy, and surfaces only when the real app meets the real API.

    Renamed with it, since the module no longer handles only specs: `SHARED_SPEC_FILES` →
    `SHARED_FILES`, `compareSpecs` → `compareSharedFiles`, `formatSpecProblems` →
    `formatSharedFileProblems`, `specProblems` → `sharedFileProblems`. The npm script and the CI
    job keep their `spec-identity` names.

    Membership is decided by "would a fork cause a _silent_ bug", not by "do these match today" —
    a dozen more files do, from favicons to `.prettierrc`, and are deliberately excluded because a
    gate that fails when one repo legitimately changes its own icon is a gate people learn to
    ignore. `scripts/specIdentity.ts` records the reasoning per entry.

### Fixed

- **Nine controllers ended their promise chain with no `.catch()`,** relying on the global handler.
  It answered a correct status, but it cannot clean up or record: `post-checkout` now increments its
  failure counter, and `write-users`' update branch now deletes the upload it had just written
  instead of orphaning the file. `post-login`, `post-logout-everywhere`, the five cart controllers
  and `put-feedback-status` are the rest.

- **`'Feedback request not found'` and `'Cart is empty'` were untranslated English literals** sent
  to users, in `services/feedback-requests.ts` and `services/cart.ts`. Both are dictionary keys now.
  The checkout failure reasons also carry explicit `code`s (`CART_EMPTY`,
  `CART_PRODUCT_UNAVAILABLE`, `CART_CHANGED`), so the analytics event reports a stable machine value
  rather than a translated sentence.

- **A `Map` of unhandled rejections that nothing ever read.** `app.ts` accumulated every unhandled
  rejection into a `Map` — Node's documented bookkeeping idiom, copied without the part that drains
  it on exit. It had no reader in any commit. The audit log line stays.

- **Seven dead branches** checking `error.message === '404'`, left with nothing to match once the
  product service stopped throwing it. `write-orders` lost the whole conditional (it already handled
  the case via `result.success`); six others lost the dead disjunct and kept the live `CastError` one.

- **`DELETE /orders` did not declare `hardDelete`** and `Order` did not declare `deletedAt` in
  `openapi.yaml`. Both now do, along with the new `hardDeleteOrderById` operation.

- **The seed fixtures and the generated realtime types were byte-identical across the two repos by
  hand, and checked by nothing.** Both are now in the identity gate; a one-line edit to either in
  one repo alone fails CI on the commit that forks it rather than on the release that ships it.

---

A correctness pass over serialization, seeding, cache invalidation and port allocation, driven by
running this stack against its paired frontend (`boilerplate-vue-frontend`) rather than only against
its own tests — followed by a concurrency pass driven by asking, for the first time, what the write
paths do when N requests arrive at once.

### ⚠ Breaking

- **A malformed id is now a 422, not a 500.** Any endpoint taking an id — in the path or as a
  search filter — used to answer **500** when the value was not a valid ObjectId (`''`, `'%00'`,
  `'undefined'`, anything not 24 hex characters). Three separate defects combined to produce it:
    1. `databaseErrorInterpreter` had no branch for the driver's `BSONError`, so it fell through
       to the catch-all 500 **and echoed the driver's message into the response body**.
    2. The `CastError` branch returned `[Number.parseInt(error.message), error.kind]` — the two
       fields swapped relative to their names, so the status was `NaN`. `res.status(NaN)` throws
       inside Express, producing a 500. This was a documented CAVEAT the module carried
       deliberately ("callers may already depend on the current shape"); nobody can depend on a
       NaN status, and it is now 422.
    3. `search()` in the base repository called `buildWhere` **synchronously** before returning
       its promise, so the throw escaped the caller's `.then().catch()` chain entirely. A
       function typed `Promise<T>` must reject, never throw synchronously — the factory and the
       order repository are both `async` now.

    Reachable **without a token**: `POST /products/search` is public and takes an `id` filter.
    Found by the new fuzz suite.

    **What changes for a caller:** those requests now answer 422 with a generic
    `Invalid identifier` instead of 500 with the driver's text. The driver's message is no longer
    in the response at all — it is logged.

- **`openapi.yaml`: three response schemas were double-wrapped and are corrected.**
  `ObservabilityHealthResponse`, `ObservabilityMetricsSummaryResponse` and `AuditLogsResponse`
  each declared an envelope (`{ success, data }`) while being used as the `data` **inside** an
  envelope. The spec therefore described a payload the API has never sent, for
  `GET /observability/health`, `/observability/metrics/overview` and `/observability/audit`.

    The API was right; the spec was wrong. The three wrappers are removed, the envelopes now
    point at the real payload schemas, and the audit page is named `AuditLogsPage`.

    Nobody had noticed because **the contract suite does not cover the observability endpoints at
    all**. The paired frontend had compensated by reading `response.data.data`, which resolved to
    `undefined` at runtime — its admin dashboard's health, metrics and audit panels were rendering
    nothing. Regenerate with `npm run genapi` in both repos.

- **`GET /observability/metrics` and `/observability/events` now document their error responses.**
  Both declared only a `200` while genuinely returning 401 (and 503 / 403 respectively), so a
  generated client had no type for the failure it would actually receive.

- **`users.email` is unique at the database level.** Signup was a check-then-insert
  (`findOne({ email })`, then `create()`), and the collection is free to change between those two
  statements: two concurrent signups for one address both read "absent" and both inserted. A
  double-clicked submit button reaches it. No application check can close that, because the gap is
  between the check and the write — only the index can refuse the second insert.

    Three things landed in order, and the order is the point. `databaseErrorInterpreter` gained an
    E11000 → **409** branch first, because the index alone would have converted a duplicate account
    into a 500. Then the schema's `users_email` gained `unique: true`. Then migration
    `20260808200000-users-email-unique.js`, which **refuses to run** against a database that already
    holds duplicates and prints every offending address with its account ids, rather than failing
    halfway through `createIndex` on one of them. Merging accounts is a product decision, so the
    migration deliberately does not make it.

    **What changes for a caller:** nothing on the happy path. A duplicate signup still answers 409;
    it just answers 409 under contention too, where it used to answer 201 twice.

- **`POST /cart/checkout` can now answer 409.** Checkout read the cart, wrote an order from it, then
  emptied the cart, with nothing tying the third step to the first — so two parallel checkouts
  produced two orders from one cart and charged the customer twice. The cart is now emptied
  _conditionally_ on the version it was read at (`cartRepository.clearLinesIfUnchanged`), which
  exactly one participant matches; the loser retracts the order it had already written and answers
  409 with `ecommerce.cart-changed`. A conditional write rather than a transaction, so no suite has
  to pay for a replica set to serialise two writes to one document.

- **`userService.consumeToken` returns `boolean`, not the user document.** It reports whether _this_
  caller was the one that spent the token, which is what lets `POST /account/reset-confirm` reject
  the second of two simultaneous uses of one reset link. Previously both succeeded.

- **`users.active` is a real stored column, independent of `deletedAt`.** It was neither: there
  was no column, `toJSON` synthesised `active = !deletedAt` on the way out, and the admin search
  filter rewrote `active` into a `deletedAt` existence check. One field wore two hats, so "is this
  account enabled" and "has this account been soft-deleted" were the same question and neither
  could be asked alone — and a client could send `active` on create or update (the contract
  advertised it, the controller read and validated it) with the value going nowhere at all.

    They are separate facts now, matching how products have always worked: an account can be
    deactivated without being deleted, and a soft-deleted account keeps whatever `active` it had.
    What they share is an effect, not a value — a non-admin sees a record only when it is active AND
    not deleted, so from outside a deleted record behaves exactly like an inactive one. Migration
    `20260808120000-user-active-column.js` backfills every existing row with `true` rather than with
    `!deletedAt`: nobody has ever set the field, so there is no prior decision to preserve, and
    copying `deletedAt` into it would re-couple on day one the two things this separates.

    **What changes for a caller:** `GET /users?active=false` now returns deactivated accounts, not
    soft-deleted ones. `POST`/`PUT` with `active` now actually persists it.

- **`User` exposes `deletedAt`,** exactly as `Product` always has. It was stripped by
  `applyUserTransform` as something that "must never leave the server" — survivable only while
  `active` was derived from it, since deletion stayed legible through that flag. Separating the two
  left deletion with no representation at all: an admin list could not tell a deleted account from
  a live one. The field appears only on accounts that have one, and every route serving a `User`
  list is admin-only (`/account` serves the caller their own record). Credentials are still
  stripped — that part of the guard did not move.

- **A product created without `active` is now active.** The model defaulted it to `false` while
  `openapi.yaml` declared no default at all — so the paired frontend's mock defaulted it to
  `true`, and the same request produced a hidden product here and a public one there, with
  nothing on either side able to see the disagreement. The contract now declares `default: true`
  on both create bodies and the model matches it. Update bodies deliberately carry no default: an
  omitted `active` there still means "leave it as it is", never "republish".

- **`?hardDelete=false` no longer permanently deletes the record.** The flag was read as
  _presence_ — `!!request.query.hardDelete` — and the query value is the string `'false'`, which
  is truthy, so a caller could destroy data by explicitly asking not to. `openapi.yaml` has always
  typed the parameter `boolean` with `default: false`, and it is now read as one: the string
  spellings a URL can carry (`true`/`1`/`on`/`yes` and `false`/`0`/`off`/`no`) are decoded, an
  absent or blank value means soft delete, and anything else — `?hardDelete=maybe` — answers 422
  rather than being guessed at. Any client relying on the old behaviour to hard-delete by sending
  a non-`true` value must send `true`.

- **Out-of-range pagination is rejected everywhere, and `normalizePagination` no longer clamps.**
  `?pageSize=500` used to answer 422 on `GET /products`, `/users` and `/orders` — where the
  controllers' own Zod bounds caught it — and a silently clamped 200 on `GET /feedback`, which
  validated nothing. `openapi.yaml` declares `minimum: 1` / `maximum: 100`, so all four endpoints
  now enforce exactly that through one shared schema (`@infrastructure/http/schemas`) and answer 422;
  `?page=0`, `?page=abc` and `?page=1.5` do the same. `normalizePagination` keeps sole ownership
  of the _defaults_ (page 1, ten per page, or `NODE_SETTINGS_PAGINATION_PAGE_SIZE`) and stops
  clamping caller values, because an API that advertises a maximum and then quietly rewrites the
  request instead of rejecting it is honouring neither answer. The env fallback keeps its bound —
  it is the one number no request schema ever sees. A client that relied on `GET /feedback`
  accepting `pageSize=500` gets 422 and must ask for 100.

- **Wrong-typed request fields are rejected with `422` instead of being coerced into something
  plausible.** `POST`/`PUT` on `/users` and `/products` ran `!!request.body.active` and
  `coerceStringArray(...)` _before_ validation, so `{"active": "not-a-boolean"}` reached the
  validator as a perfectly good `true` and answered `201`. A JSON body now goes to the validator
  exactly as sent, which is what lets it reject one; `multipart/form-data` — the only transport
  that cannot carry a type — is still decoded first. A client sending the _string_ `"true"` in
  JSON, or a number for `categories`/`tags`, now gets `422` where it previously got a silently
  corrected success. `price` below its declared `minimum: 0` is likewise rejected rather than
  stored.

- **`GET /account/refresh/{token}` is removed.** Refreshing accepts the `HttpOnly` `jwt` cookie and
  nothing else. A refresh token passed in the URL path is written to browser history, proxy and
  server access logs, and any `Referer` header the page later sends — and it is a long-lived
  credential, so each of those is a full account takeover, not a scoped leak. The path form bought
  nothing the cookie form did not already do. `GET /account/refresh` is unchanged, and it is what
  the frontend has always called. The `TokenPathParam` component went with the path, having had no
  other consumer.

- **Cart responses no longer include the populated `product` on each line.** Every cart endpoint
  returned a full product object per item, while `CartItem` in `openapi.yaml` is
  `additionalProperties: false` over `{ productId, quantity }`. No client read it — the frontend
  renders the cart from `productId` and `quantity`, and its mocks always returned the two-field
  shape, so the mocks and the real API had quietly disagreed for the whole life of the endpoint.
  Anything that relied on `cart.items[].product` must fetch the product itself. The populated form
  is still available internally through `cartService.cartGet`, which is what prices the cart.

- **Order responses no longer include `total`.** They now carry `totalItems` (line-item count),
  `totalQuantity` (sum of quantities) and `totalPrice` (sum of price × quantity) — the three
  figures the API had in fact been returning on its list endpoint all along, while `openapi.yaml`
  declared a single `total` that no endpoint ever sent. Any consumer reading `order.total` must
  switch to `order.totalPrice`.
- **Validation failures in the auth service now return `422`, not `400`.** `login`, `signup` and
  `passwordChange` answered `400` while every other service used `422`; `openapi.yaml` declares
  `422` and never declared `400` at all.
- **API responses now return `id` instead of `_id`, and no longer include `__v`.** This already
  applied to users; it now applies to products, orders and feedback requests, which is what
  `openapi.yaml` always declared. Any consumer reading `_id` off a response must be updated.
- **Host ports moved.** This repo now owns the `3000–3099` block: Umami `8090` → `3080`, docs
  `4173` → `3090`. Update bookmarks, Grafana datasource URLs and any frontend pointing at the old
  Umami origin.
- **`db/migrations/20240101000000-initial-seed-data.js` was replaced** by
  `20240101000000-initial-indexes.js`. A database that already ran the old migration keeps its
  changelog entry; the demo data it inserted is now owned by `db:seed`.
- **`npm run db:cache:clear` now exits `1` when Redis is unreachable** instead of reporting success.
  Any script that ignored its exit code will start failing — correctly.

- **`GET /observability/load-test` is removed**, together with the `ObservabilityLoadTestResult`
  and `ObservabilityLoadTestResponseEnvelope` schemas and their generated models. It was never
  registered under `NODE_ENV=production`, so no deployed client could have reached it — but it was
  declared in `openapi.yaml`, and therefore present in every SDK generated from it. It also did not
  do its job: it busy-looped emitting 20 000 log lines, which measures Winston rather than the API,
  and because the loop never yielded it blocked the worker outright, so `/observability/health` and
  `/observability/metrics` timed out for its whole duration and the dashboards it existed to
  exercise showed a gap where the spike should have been. Load is now generated from outside the
  process with `npm run load:test`.

- **The cart is its own `carts` collection, not a subdocument of the user.** Storage only —
  `CartItem`, `CartResponse`, `CartSummaryResponse` and all four `/cart*` paths are byte-for-byte
  what they were, which is why both halves ship in one deploy with no dual-read window. Migration
  `20260808160000-cart-collection.js` copies every non-empty embedded cart into `carts`, `$unset`s
  `users.cart`, and creates the unique `userId` index — named `userId_1`, matching what Mongoose
  derives from the schema's `unique: true`, so whichever of the two creators runs second is a
  no-op rather than a conflict. See "The index rule" below.

    One field carrying two meanings is what paid for the old shape. `ICartItem.product` was an
    `ObjectId` at rest and a `Product` after `populate()` — the same field, overwritten in place —
    so `cart` had to be stripped from every user response by hand (unlike `password`/`tokens` it
    was not even `select: false`, so the `omit` was the only guard), and every cart mutation loaded
    the whole user, saved it, and was then re-read by its controller.

    A cart line is stored as `{ productId, quantity }` with `_id: false` — the names `openapi.yaml`
    already uses, so a stored line and a wire line are the same shape and there is nothing to
    translate. `carts.userId` is `unique`, which makes "the user's cart" a complete address and
    every mutation a `findOneAndUpdate` keyed by it; adding an item is now one or two writes plus
    the join that prices the answer, against four round trips before. Each write carries its
    condition in the filter rather than in a preceding read, so two tabs adding the same product
    cannot both conclude "absent" and leave one product on two lines — the one that loses hits the
    unique index, and a duplicate key is retried rather than surfaced.

    Absence and an empty cart are the same state: no document exists until the first write, no
    empty placeholder is ever created, and clearing a cart nobody has is a success. Deleting a
    product now `$pull`s across `carts` instead of scanning every user document, and **hard-deleting
    an account deletes its cart** — that came free while the cart was a field on the user, and has
    to be asked for now that it is not.

    **What changes for a caller:** nothing on the wire. The one behavioural change is that cart
    operations no longer 404 for a user id that does not exist — a cart is addressed by `userId`,
    not fetched through the user. `DELETE /cart` never declared that 404 anyway; `POST /cart`
    still 404s for a product that does not exist, `DELETE /cart/{productId}` for a line that is
    not in the cart, and checkout still 404s for a missing account, because an order records the
    address it was placed from.

### Added

- **`tests/helpers/express.ts`** — the chainable Express response stub, previously copied into
  four test files verbatim. Documents when a stub is the right tool (a unit that WRITES a
  response) and when it is not (anything asking what the API actually returns, which belongs to
  the supertest harness).

- **Tests for the four agnostic core files that had the weakest ones**, chosen because they are
  the parts every application built from this boilerplate inherits unchanged rather than the parts
  that sell products. Each was falsified by breaking the source and confirming the suite goes red:
    - `services/auth.ts` (53.47% → 76.24%) had **no unit test of its own**; what coverage it had
      came incidentally from controller suites exercising happy paths. The new cases pin three
      security properties that read as ordinary branches: the two login failures must be
      **indistinguishable** (otherwise the endpoint is an account-existence oracle), a
      **soft-deleted** account must not be able to log in (one key in one filter object), and a
      password must never be stored as it arrived.
    - `core/adapters/cache.ts` (48.00% → 68.00%) — the read/write/tag-invalidate path had **zero**
      executed mutants, because exercising it needs a Redis. Against a fake client the new cases
      pin fail-open behaviour (a cache is an optimisation, never a dependency), key namespacing
      (two deployments sharing a Redis must not read each other's entries), the tag reverse-index
      that makes group invalidation possible at all, and the empty-set guard that keeps `DEL` from
      being issued with no arguments — a protocol error, not a no-op.
    - `core/adapters/queue.ts` (53.33% → 71.11%) — the consumer callback was registered by tests
      and never invoked, so the entire **acknowledgement policy** was unmeasured. The new cases
      pin all four arms, including the poison-message rule: a message whose bytes will never parse
      is discarded rather than requeued, because requeueing puts the consumer in a hot loop
      against the broker, and `requeue` is a single boolean nothing else reads.
    - `core/adapters/storage.ts` (51.56% → 73.44%) — `validateUploadedImages`, the content check
      that reads an upload's leading bytes, had no test at all. It is the only control that can
      catch a disguised upload (`fileFilter` sees the client-supplied `Content-Type` and nothing
      else), and it has a second rejection that is easy to omit: bytes that ARE an image but not
      the declared one, which would otherwise be served under the wrong `Content-Type`.

- **Spec-driven fuzzing** (`npm run test:fuzz`, nightly via `fuzz.yml`). Walks `openapi.yaml`,
  generates spec-valid but hostile requests for every operation it finds, and asserts no 5xx and
  a spec-conformant response. The endpoint list is **derived, never written down**: a route added
  to the spec is fuzzed on the next run.

    That auto-discovery is what `schemathesis` would have provided; it is assembled here from
    four things the repo already had — the spec, `fast-check`, supertest and `jest-openapi` —
    rather than adding a Python toolchain every copy of this boilerplate would inherit.

    It carries a tripwire on itself: `SUPPORTED_KEYWORDS` fails a test when the spec starts using
    a JSON Schema keyword the generator ignores, because that failure is otherwise silent and
    green (an unconstrained field means every request is rejected as 422 and the suite tests the
    validator instead of the handler). It has already fired once, for `minItems`.

    Its first run found five bugs — see Breaking and Fixed.

- **The per-file mutation ratchet** — `scripts/mutationBaseline.ts`, a committed
  `mutation-baseline.json`, and `npm run test:mutation:check` / `:baseline`, wired into
  `mutation.yml`. Stryker's thresholds are GLOBAL (`high`/`low`/`break` and nothing else), which
  is the pooling failure of a directory-shaped coverage threshold one level up: a strong file
  carries a weak one and the number that passes is an average nobody can act on. That matters
  MORE as `mutate` widens, not less.

    A ratchet rather than a wall — improvements are recorded, regressions fail and **cannot be
    laundered**: `--update` on a regressed file keeps the higher value and still exits non-zero.
    New files are recorded at whatever they first measure, including `0`.

- **Mutation scope widened** to services, models, repositories, middlewares, jobs and core.
  Controllers are deliberately still out, and the reason is about the ruler rather than about
  them: only the unit suite runs under Stryker, while the controllers are covered by
  `tests/contract/` and `tests/integration/`. Scoring them here would report ~0% for 35 files —
  not "untested surface" but the wrong instrument, which the ratchet would then defend forever.

- **Property-based tests** (`fast-check`) over `core/totals.ts`, `models/serialize.ts` and
  `repositories/search.ts` — the pure, total, invariant-rich functions. `escapeRegex` in
  particular is a denial-of-service control on a public endpoint, and "no user string reaches the
  regex engine as a pattern" is a claim about every input that a table of metacharacters cannot
  support. One of these found a live defect (see Fixed).

- **A concurrency suite** — `tests/integration/concurrency/`, 18 cases over the account and cart
  endpoints, plus a `raceN` helper (`tests/helpers/race.ts`) built on `Promise.allSettled` rather
  than `Promise.all`: losing is the _normal_ outcome of a race, and `all` discards exactly the
  results being asserted. It is the one layer mutation testing structurally cannot cover — a
  mutation run executes one mutant against a serial suite.

    The helper asserts against 429 as well as 5xx, and the reason is worth repeating: the auth
    limiter is mounted on precisely the endpoints these tests hammer, so at its default budget an
    N=12 signup race starts returning 429s — and the test still _passes_, because "not two users" is
    trivially true when two requests never reached the handler. A race truncated by a limiter is a
    green test that measured nothing. One case keeps a small, freshly-constructed limiter to prove
    the budget is still enforced rather than switched off.

    Four of the cases found live bugs (see Fixed). The cart cases are the tests
    `repositories/carts.ts`'s retry never had: the retry branch, the `attemptsLeft` bound and
    `isDuplicateKey` were all live mutants behind a comment explaining why they were correct.

- **Unit suites for four files that had none** — `middlewares/security.ts`, `middlewares/locale.ts`,
  `middlewares/auth-jwt.ts` and `services/audit-logs.ts`, all previously at 0% and all invisible
  behind pooled coverage thresholds (see Changed). `security.ts` is not the bare `rateLimit()`
  config object it had been assumed to be: it holds `isMetricsScraper`, the credential check on the
  Prometheus endpoint, whose deny-by-default branch, required `Bearer` scheme and length-guarded
  `timingSafeEqual` are now each pinned separately.

- **The cross-repo contract check** — `scripts/specIdentity.ts`, `npm run check:spec-identity`, and
  a `spec-identity` job in `ci.yml` that checks out the paired frontend and compares
  `openapi.yaml`, `asyncapi.yaml` and `spectral.yaml` by digest. All three exist in both repos,
  byte-identical, maintained by hand, and were verified by nothing: every existing spec job lints
  _this_ repo's copy and passes, because a forked spec is still a valid spec.

- **A test that makes the migrations and the models meet** —
  `tests/unit/db/migration-model-indexes.test.ts`, plus the rule it enforces, written up as
  "The index rule" in [`docs/tools/mongodb-mongoose.md`](docs/tools/mongodb-mongoose.md).

    Two places here create indexes and both are legitimate: a schema (`unique: true`,
    `schema.index(...)`, built at boot because `autoIndex` is on) and a migration (explicit DDL via
    `migrate-mongo`). They collide on names. Mongo treats an index's name as part of its identity,
    so `createIndex` is a no-op only when name _and_ key spec match what is stored — the same key
    under a different name is `IndexKeySpecsConflict`, which Mongoose reports at startup as
    `Index already exists with a different name`.

    No suite could see that. Every test runs on a `mongodb-memory-server` database that has never
    been migrated, so Mongoose creates each index unopposed and passes; the migrations are plain
    CommonJS that nothing in the suite executed at all. The two only met on a real deployment.

    This runs every migration and every model's index build against one database, in both orders,
    twice, and then asserts each collection holds **exactly** the indexes its schema declares. That
    last check earns its place three times over: it catches an index a migration creates that no
    schema knows about, a declaration that never reaches the database, and a migration dropping an
    index by a name it does not have — which otherwise passes silently, since dropping an absent
    index is deliberately tolerated.

- **A "where test data comes from" map** in [`docs/tools/testing-and-docs.md`](docs/tools/testing-and-docs.md),
  answering a question worth asking out loud: seven things across the two repos can hand you an
  entity, so which are necessary? The page names each one's job, and shows the shape — one
  hand-maintained dataset, two mappers over it (one per runtime, because mongoose documents and
  API entities are different shapes of the same truth), and four generators that exist because
  "the demo data", "some data" and "deliberately illegal data" are three different questions.
  Merging any two of the four would mean one of those questions stops being asked. The merge that
  _was_ worth doing — the demo dataset, previously written out by hand in both repos and kept in
  step by a comment — is `db/seeds/seed-identities.ts`, below.

- **`db/seeds/seed-identities.ts`,** the demo dataset's facts as dependency-free plain data,
  byte-identical to a copy in the paired frontend on the same convention as
  `scripts/gen-asyncapi-types.ts`. `db/seeds/fixtures.ts` is now only the mapper into mongoose
  shape, and the frontend keeps its own mapper into API-entity shape — which is why the shared
  file holds facts rather than whole records. `diff` between the two copies answers "have the
  seeds drifted?" in one command. It has to stay import-free: the frontend loads it under
  Vite/vitest ESM, and a mongoose import would make it unloadable there. The parity it protects
  is not hypothetical — the frontend's mock once served all 5 products to everyone while this API
  served 3 to non-admins, and the spec asserted the mock's number and passed.

- **A persisted audit trail behind `GET /observability/audit`.** The endpoint answered from a
  200-entry in-process ring buffer, and it already advertised `?actor=<userId>` — "show me this
  user's history" — which the buffer could not answer. 200 entries is a total across every actor,
  so a busy hour evicts a user's actions within minutes; the buffer is per-worker, so with
  `NODE_ENABLE_CLUSTERING=1` each request lands on a random worker and sees roughly `1/N` of the
  events, and a refresh returns a different list; and it empties on restart. Entries now go to a
  Mongo `auditlogs` collection as well, with compound indexes on `{ actor, timestamp }` and
  `{ action, timestamp }` matching the two filters that are not full scans, and a TTL index on
  `timestamp` driven by `NODE_AUDIT_RETENTION_DAYS` (default 90) so the one collection here that
  only ever grows does not. The audit _log_ is unchanged and remains the compliance record: this
  is the queryable copy, and it is allowed to fail — a rejected write becomes a warning, never a
  failed request, because these run while answering logins and permission denials.

    None of the 53 `emitAuditEvent` call sites across 21 files changed. `src/infrastructure/**` may not import
    `@repositories/*` (`no-restricted-imports`), so rather than route around the rule,
    `@infrastructure/observability/audit` declares an `IAuditSink` port and `app.ts` registers
    `auditLogService.record` against it once the database connects — the same inversion as
    `IImageStore`. Swapping the destination for a log-backend writer later is one line in `app.ts`.

- **`docs/tools/events-and-logging.md`** — the map of every signal the application emits.
  Application log, audit trail, product analytics, metrics, traces, the SSE metrics feed and queue
  jobs are seven separate mechanisms, four of them neighbours in `src/infrastructure/observability/` and
  three declared in the same `asyncapi.yaml`, which is enough adjacency to make them read as one
  system they are not. The page states what each is, where it ends up, who reads it, and which to
  reach for — the audit-vs-analytics overlap in particular, where `USER_SIGNED_UP` and
  `auth.signup.succeeded` describe the same instant and both belong. Linked from the tools index,
  from `winston.md`, `posthog.md` and `observability-reference.md`, and added to the sidebar
  alongside `frontend-observability.md`, which existed but had never been listed in it.

- **`DELETE /products/{id}/hard` and `DELETE /users/{id}/hard`** — the same operation as
  `DELETE /{resource}/{id}?hardDelete=true`, with the flag spelled in the path instead of the
  query. Neither form is canonical; accepting one value several ways is the point of the input
  layer, and it now costs a route line and a `routeFlag('hardDelete')` middleware rather than a
  second controller. The path form outranks a contradictory query parameter, because the URL a
  caller aimed at is the more explicit statement of intent.

- **Redis is started with a memory ceiling and an eviction policy** —
  `--maxmemory ${NODE_REDIS_MAXMEMORY:-256mb} --maxmemory-policy ${NODE_REDIS_MAXMEMORY_POLICY:-allkeys-lru}`
  in `docker-compose.yml`, both overridable from `.env`. Redis defaults to unlimited memory, which
  is the wrong default for a cache whose entry count follows traffic rather than data size: left
  alone it grows until the host or the container limit stops it. `allkeys-lru` is what makes the
  ceiling a cache policy instead of an error — at the limit Redis evicts the least recently used
  key and accepts the write, where the `noeviction` default would start refusing writes and leave
  the app logging a warning per request while caching nothing.

- **The Redis cache refuses to store oversized responses**, above
  `NODE_REDIS_CACHE_MAX_BYTES` (default 256 KB). Caching turns a cheap request into long-lived
  server state: `GET /products` is public, its entries live for an hour, and the key carries the
  full URL, so an unauthenticated caller could otherwise mint a distinct large entry per query
  string and keep every one of them resident. The response is still returned — skipping is a lost
  optimisation, not a failure — and a warning names the key and the size. The page size maximum
  already bounds this in practice (a hundred products serialize to roughly 50 KB, well under the
  limit); the guard is what makes the property hold regardless of which endpoint is writing.

- **Nine operations now declare the `422` they have always been able to return.** `GET /products`,
  `/users`, `/orders`, `/feedback` and five of the delete operations validated their input and
  answered 422 while `openapi.yaml` listed only 200/401/403/404/500. Declaring it is what lets the
  contract suite assert those responses at all — until now they were invisible to
  `toSatisfyApiSpec`.

- **Uploaded images are served.** `public/` is mounted through `express.static`, which it never
  was: uploads were written to `public/images/` and served by nothing, so every `imageUrl` this
  API stored pointed at a URL it would not answer. Kept in the API rather than delegated to a
  reverse proxy so the guarantees stay where the test suite can hold them — `dotfiles: 'ignore'`,
  no directory index, `Cross-Origin-Resource-Policy: cross-origin` (helmet defaults to
  `same-origin`, which would have the paired frontend fetch an image and then refuse to render
  it), and a one-year immutable cache, which is safe because a filename is 128 bits of randomness
  derived from nothing the client controls.

- **Per-request language.** Every endpoint honours `Accept-Language` — q-weights, region tags
  (`en-GB` → `en`), `*`, and a fallback rather than an error for anything unsupported. The
  negotiated language is stated back in `Content-Language`, and `Vary: Accept-Language` is set so
  no shared cache can hand one language's body to another language's request. `src/infrastructure/i18n.ts`
  carries it down the request's async chain with `AsyncLocalStorage`, so a Zod thunk twelve calls
  deep resolves in the caller's language without `t` being threaded through twelve signatures.
  Never `i18next.changeLanguage()`, which mutates one global and is async: two overlapping
  requests in different languages would answer each other's. An integration test fires twenty
  interleaved requests in alternating languages as the standing guard.

- **`src/locales/it.json` and `src/locales/es.json`.** Adding a language is now one step — drop the
  file in. `i18next.init()`'s resources and the negotiator read the same list, so nothing else has
  to be told. `NODE_SUPPORTED_LOCALES` overrides the directory when you want to ship a dictionary
  without exposing it yet.

- **`GET /locales` and `GET /locales/:locale`.** Which languages a deployment supports is runtime
  state — it depends on which dictionaries were deployed — so it cannot be an enum in
  `openapi.yaml`; a client has to ask. `GET /locales/:locale` serves **this API's own** dictionary,
  never a client's UI copy: the two repositories are independent, and view text in the API's
  keyspace would make them undeployable apart. Public and cacheable, because a client that has just
  failed to reach the API is exactly who needs them.

- **A persisted `locale` on the user document.** `Accept-Language` answers "what language is this
  request in", which is all a stateless API needs for a response. It cannot answer "what language
  should the email a worker sends at 3am be in", because there is no request to read. Set at signup
  from the negotiated locale, editable from the user endpoints, part of the `User` contract, and
  backfilled by `20260806120000-user-locale.js`. Every email addressed to a known user is sent in
  it, falling back to the request's.

- **Localised emails and invoices.** The seven `views/templates-emails/*.ejs` templates and the
  invoice PDF resolve their copy through `t` instead of carrying hardcoded English, subjects
  included. The locale travels in the queue payload — `AsyncLocalStorage` does not survive the hop
  to a worker that may not even be in the same process — and both workers re-establish it before
  rendering. One deliberate exception: the contact-form notification goes to the support mailbox,
  not to the person who filled in the form, so it renders in `NODE_DEFAULT_LOCALE`.

- **`decodeFormFields()`** in `src/infrastructure/http/request.ts`, over `isMultipartRequest()` and
  `parseFormBoolean()`. A write controller declares _which_ of its fields are booleans and which
  are string arrays; how either is spelled on the wire stops being the controller's business. Both
  write controllers had grown a copy of that rule, and the two copies' comments had already
  drifted apart on what it did.
- **Per-path coverage floors in `jest.config.json`** — 70% statements/branches/functions/lines over
  the same four paths `stryker.config.json` mutates, mirroring what `vitest.config.ts` already does
  on the frontend. Mutation testing answers "do the tests assert anything"; coverage answers "do
  the tests run this at all", which is the cheap check and belongs in CI, where mutation testing
  does not. Current figures clear it comfortably: `core/http` 99.66%, `models` 100%, `services`
  97.29%, `middlewares` 91.9%.
- **`src/infrastructure/totals.ts`** — `sumLineItems()` and `toCents()`, the one implementation of "sum a list
  of `{ quantity, product: { price } }`". Orders and carts had grown a copy each, and they had
  already drifted: the order copy rounded to cents, the cart copy did not. The two still name their
  outputs differently because `openapi.yaml` does (`totalItems`/`totalQuantity`/`totalPrice` against
  `itemsCount`/`totalQuantity`/`total`), which is the only difference left between them.

- **Contract suites for `/cart` and `/feedback`** — `tests/contract/cart.test.ts` (22 tests) covers
  all seven cart endpoints and their error branches; `tests/contract/feedback.test.ts` (14 tests)
  covers the public contact endpoint next to the two admin-only ones, including 401 vs 403. Two
  signup cases were added to `users.test.ts` for the 409 below. The contract layer went from 4
  suites / 20 tests to 6 / 58, and the cart suite failed three different ways on its first run —
  see _Fixed_.
- **Mutation testing** — Stryker with the jest runner, `npm run test:mutation`, scoped to
  `src/services/`, `src/models/`, `src/middlewares/` and `src/infrastructure/http/`. It runs in its own
  workflow (`.github/workflows/mutation.yml`, nightly + on demand) and deliberately **not** in
  `ci.yml`: a run re-executes the unit suite once per mutant, so keeping it out of the `ci`
  aggregate is structural rather than a convention. Thresholds come from real runs, not from
  numbers picked in advance, and the rule is one-directional: raise `break` when the score rises,
  never lower it to make a run pass.

    Three runs, because the path between them is the useful part:
    1. **41.84% total / 60.93% covered**, 1379 mutants. The finding was the _gap_ between the two
       numbers: `core/http/scopes.ts`, `uploads.ts`, `errors.ts` and the `authorizations`, `token`,
       `cookie`, `observability` and `security` middlewares, plus `services/auth-tokens.ts`,
       `cart.ts` and `feedback-requests.ts`, had **no unit test at all** — reached only through the
       integration and contract suites, which is why nobody had noticed.
    2. **59.99% / 68.50%**, after those files got tests. The remaining survivors had clustered in
       pure code that looked too simple to bother testing: `services/cart.dto.ts` (54 survivors),
       `core/http/response.ts` (31), the model schema declarations (114), and the write half of
       `services/orders.ts` (78 mutants with no coverage at all).
    3. **73.96% / 78.31%**, 1374 mutants, ~10 minutes at `--concurrency 12` (~21 at the configured
       4). `break` raised 38 → **70**.

    Still weak, in rough order of payoff: `services/products.ts` (52.17%), `services/auth.ts`
    (53.19%), `services/users.ts` (58.04%), `models/user-validation.ts` (40%). The
    `middlewares/security.ts` entry reports 0% because it is a bare `rateLimit()` config object
    with no branch to exercise — leave it.

- **Unit tests for every module the first mutation run named as uncovered.** The unit suite went
  from 28 files / 424 tests to **40 / 577**. New files:
  `tests/unit/infrastructure/http/{scopes,errors,uploads}.test.ts`,
  `tests/unit/middlewares/{authorizations,cookie,token,observability}.test.ts`,
  `tests/unit/services/{auth-tokens,cart,feedback-requests,orders-crud}.test.ts` and
  `tests/unit/models/schema-contracts.test.ts`; `cart.dto.test.ts` and `core/http/response.test.ts`
  were expanded from 2 and 4 tests to 27 and 26.

    Assertions are derived from `openapi.yaml` and each module's documented intent rather than from
    re-reading its body, which is what makes them able to disagree with the code — see _Known
    issues_ for the five places they did. The pointed ones:
    `token.test.ts` keeps the refresh path's database revocation lookup mandatory (without it logout
    is cosmetic and a stolen refresh token stays valid for its full lifetime); `cart.test.ts` keeps
    `cartItemSetById` and `cartItemAddById` apart, since they share one `upsertCartItem` differing by
    a single ternary; `schema-contracts.test.ts` pins the defaults and `select: false` credentials
    that the over-serialization fixes below depend on.

- **`tests/unit/infrastructure/http/request.test.ts`** (27 tests), the first unit coverage that file has had.
  It is where the `DELETE /cart/{productId}` crash below lived.
- **`test:unit:coverage` and `test:all` scripts**, plus `collectCoverageFrom` in
  `jest.config.json` so coverage measures `src/` rather than the generated `api/`.
- **A `Conflict` (409) reusable response in `openapi.yaml`**, declared on `POST /cart/checkout`
  (empty cart) and `POST /account/signup` (address already registered), and a `404` on `POST /cart`
  (unknown product). All three are statuses the implementation has always sent and the spec never
  declared.

- **`additionalProperties: false` on every object schema, at every nesting level** — 92 in total;
  the only exceptions are `ErrorItem.details` and the audit metadata map, which are genuine
  free-form key/value maps. The success and error envelopes previously could not be constrained at
  all because `additionalProperties` is ignored on an `allOf` base; they are now flat schemas that
  share their preamble through YAML anchors, so the shape is still written exactly once.
  `SuccessEnvelope` was removed as a result — nothing references it any more.

- **Contract test suite** (`tests/contract/`, `npm run test:contract`, `test-contract` CI job).
  Drives the real Express app over HTTP with supertest and an in-memory Mongo, then validates every
  response against `openapi.yaml` via `jest-openapi` — `additionalProperties: false` included.
  This is the gate for the whole over-serialization class: any field appearing on a response
  without being declared in the spec now fails CI, rather than only the four field names the model
  tests assert by hand.
- **`additionalProperties: false` on 26 response schemas** in `openapi.yaml`. The constraint was
  previously only on request bodies, so the contract permitted exactly the leaks that had to be
  fixed by hand. `SuccessEnvelope` and `ErrorResponse` are deliberately excluded — they are `allOf`
  bases, where the constraint would reject properties contributed by sibling subschemas.
- **`HealthPing` / `HealthPingEnvelope` schemas** — `GET /` returns `data: { status: 'ok' }` and was
  typed as `MessageResponse`, which declares no `data`.
- **`tests/helpers/http.ts`** — supertest harness plus `authenticateAs('admin' | 'user')`, which
  logs in through the real `POST /account/login` rather than signing a token by hand.
- **`id` serialization for every resource.** `applyProductTransform()`, `applyOrderTransform()` and
  `applyFeedbackRequestTransform()` in their respective models, wired through
  `schema.set('toJSON', { virtuals: true, versionKey: false, transform })`, mirroring the existing
  `applyUserTransform`. `applyOrderTransform` also strips the stray `_id` older documents carry on
  embedded order items, and recurses into the embedded product snapshot.
- **Credential-scoped repository finders.** `findByIdWithCredentials` / `findOneWithCredentials` in
  `src/repositories/users.ts` — the only sanctioned way to re-select `password` and `tokens`. The
  `+password +tokens` selector is written down exactly once.
- **`clearCache()`** in `src/infrastructure/adapters/cache.ts` — `SCAN` + `DEL` over `<CACHE_PREFIX>:*`,
  deliberately not `FLUSHALL`, so a Redis shared with another app or environment is untouched.
  Returns `{ deleted, reachable }`.
- **`resolveCacheTtl()`** in the same adapter, plus `NODE_REDIS_CACHE_DEV_TTL_MAX` (default `30`s):
  outside production, response-cache TTLs are clamped. `0` disables the cap; a malformed value falls
  back to the default rather than caching forever. Production is never clamped.
- **`db/cache-clear.ts`** and `npm run db:cache:clear` — the manual escape hatch after `mongosh`
  surgery.
- **`db/run-script.ts`** — a shared `runScript(main, cleanup)` for `db/` entry points: awaits the
  body, logs a real error and sets `process.exitCode = 1` on throw, and runs `cleanup` in a
  `finally` so connections close on both paths. Uses `process.exitCode` rather than
  `process.exit()`, so Node drains stdout instead of truncating the line that explains the failure.
- **`db/migrations/20240101000000-initial-indexes.js`** — indexes only (users: `email`,
  `tokens.token`, `deletedAt`; products: `createdAt`, `active+deletedAt`; orders: `userId+createdAt`,
  `email`), dropped in `down()`. `createIndex` is idempotent, so re-running is a no-op.
- **`db:bootstrap`** (`db:migrate:up && db:seed`), wired into the compose `app` command ahead of the
  server, so a fresh `compose up` produces a populated, browsable demo.
- **`:host` script variants** for working outside containers: `dev:host`, `db:migrate:up:host`,
  `db:migrate:down:host`, `db:migrate:status:host`, `db:seed:host`, `db:seed:reset:host`,
  `db:cache:clear:host`, `db:bootstrap:host`. Added `cross-env` as a devDependency so they work on
  Windows.
- **A `mongosh ping` healthcheck** on the compose `database` service; `app` now waits on
  `condition: service_healthy`, because boot-time bootstrapping needs Mongo actually accepting
  connections rather than merely started.
- **Tests — 284 → 297.** `tests/unit/models/{users,products,orders,feedback-requests}.test.ts`
  (serialization regression guards, on both `.toJSON()` output and lean/aggregate reads),
  `tests/unit/infrastructure/adapters/cache.test.ts` (six cases over `clearCache`, including the refused
  connection that is the regression gate for the silent-success bug), and
  `tests/unit/db/run-script.test.ts` (seven cases, including that cleanup still runs when the body
  throws).
- **Documentation** — README sections on seeding and the response cache, a _Running on the host_
  table pairing each script with its `:host` twin, `docs/tools/redis-cache.md` _Writes that bypass
  the API_, and `docs/tools/email-and-rendering.md` _Using a hosted provider_.

- **`npm run load:test` and `npm run load:test:search`** — [autocannon](https://github.com/mcollina/autocannon)
  against a running server, 20 connections for 30 seconds with a latency histogram, honouring
  `NODE_PORT`. Two scripts because they exercise deliberately different paths: `GET /products` is
  cached, so it measures Redis and the HTTP stack, while `POST /products/search` is not, so it is
  the one that moves `http_request_duration_milliseconds` and shows database time inside a trace.
  Real requests through the real stack are what make the three signals agree — a p95 on a Grafana
  panel is then a p95 a client actually experienced. `autocannon` is a devDependency; nothing about
  load testing ships in the server.
- **`docs/tools/load-testing.md`** — how to run one, what to watch while it runs (the event-loop lag
  gauge, in-flight requests, Tempo, Loki), and how to read the result: check non-2xx first, because
  a run reporting excellent latency and 40% `429` is measuring the rate limiter.
- **Tests** — `tests/unit/repositories/search-pagination.test.ts`, nine cases over
  `normalizePagination` covering the defaults, the 1-100 bounds, the env fallback and a non-numeric
  env value, which must not silently disable paging.
- **`docs/tools/redis-cache.md` — _Redis and the workers_**, replacing the section that documented
  the pub/sub removed below. Three diagrams, because the question it answers is a spatial one: the
  cluster topology (one primary, N workers, one connection each, a single shared keyspace and no
  per-worker copy of anything); a sequence in which a write handled by worker 1 makes worker 2 miss
  on its very next read, with no message passing between them — the reason a broadcast has nothing
  left to do; and the queue workers, which are a second meaning of the word, RabbitMQ consumers
  registered inside every cluster worker and touching no cache at all. That last one earns its place
  as a warning: a queue worker that writes to Mongo never passes through the `invalidateCache`
  middleware, which makes it one of the _writes that bypass the API_ documented further up the same
  page. `docs/theory/clustering.md` is corrected alongside it — its diagram drew only worker 1
  reaching Redis, which is precisely backwards from the property the cache depends on.

### Changed

- **Test-infrastructure files now document their own patterns**, so the rules they encode are
  legible without reverse-engineering them: `jest.config.js` states why per-file coverage globs
  are not cosmetic and how they pair with stryker's `mutate` list; `tests/helpers/setup.ts`
  explains why it must run before any test module is imported; `tests/helpers/setup-test-db.ts`
  states the per-test isolation guarantee and why it is per test rather than per file.

- **`stryker.config.json`'s notes cut from 167 lines to 73.** They now carry only the reasoning
  behind the settings — scope exclusions, why it never gates a PR, why concurrency is bounded by
  memory rather than cores — and point at `docs/tools/mutation-testing.md` for the rest.

- **`authService.tokenAdd`/`tokenRemoveAll` now go through the document's own atomic token
  methods** instead of keeping a second copy of the same logic. The invariant both sides now hold
  explicitly: the `tokens` array is **appended to and pulled from, never rebuilt**.

    This is hardening rather than a bug fix, and the distinction is worth recording. Mongoose tracks
    the _change_ rather than the result, so `tokens.push(entry)` followed by `save()` already emits a
    `$push` and was never the lost-update hazard it resembles. What IS hazardous is rebuilding the
    array — `user.tokens = [...user.tokens, entry]`, or the filter-and-assign that `tokenRemoveAll`
    used — because that becomes a `$set` of the whole array and erases anything another request added
    in between. For "log out everywhere" that means a session the user just revoked coming back.

    Two unit cases now pin the invariant from both directions, and both fail when the append is
    rewritten as an array rebuild.

- **Coverage thresholds are per-file, and `jest.config.json` became `jest.config.js`.** A threshold
  key naming a _directory_ (`src/services/`) is applied by Jest to everything beneath it as one
  pooled total; a key that is a _glob_ is applied to each matching file, and the failure names the
  file. Under the pooled form this repo passed a 70% floor on `src/middlewares/` while three files
  sat at 0%, and on `src/services/` while a fourth did — four untested files inside two green gates.
  All four now have suites, so no exemption was needed; the config records the mechanism for writing
  one down if it ever is (an exemption must _leave_ the glob, because Jest adds a file to every
  matching group rather than the most specific one). The rename is because JSON cannot carry a
  comment and Jest warns on any key it does not recognise.

- **Indexes are declared on the schema of the model that owns them.** They were split between the
  models and a migration, with neither able to see the other. That is not a style preference: Mongo
  identifies an index by its name as well as its key, so two authors asking for the same key under
  different names is an error rather than a no-op — and it surfaces while the app is starting,
  against any database where both have run. No test could reach that state, since every suite runs
  on a database that has never been migrated.

    Moving them also made them reviewable for the first time, and three turned out to answer no
    query at all. An index is rebuilt on every insert and update of its collection, so one nothing
    reads is pure cost. `20260808180000-prune-unused-indexes.js` drops them:
    - `users.deletedAt` — the admin listing filters the `active` column, a separate field. The one
      login query mentioning `deletedAt` also matches on `email`, which is near-unique and indexed,
      so the account is found by address and its deletion state read from the single result.
    - the descending `auditLogs.timestamp`, alongside the ascending TTL index on the same field. A
      single-field index is walked in either direction, so the two answered the same questions.
      The TTL one stays — it also performs the expiry.
    - `feedbackRequests.email` — the only query touching it matches case-insensitively and
      unanchored, which no B-tree index can serve. That collection is scanned either way.

    An order embeds a copy of each product bought, and Mongoose copies an embedded schema's indexes
    onto whatever embeds it — so declaring the catalogue's indexes would have quietly indexed the
    frozen snapshot inside every order too, paying for it on each order write and matching nothing
    anyone asks. `excludeIndexes` on that path stops it.

- **Mutation testing covers the repository layer, and its thresholds are bands.** Repositories are
  where query construction lives — the positional-vs-upsert branch behind a cart write, the filter
  guards that make concurrent writes safe, `buildWhere`'s filter assembly. A repository reads as
  thin delegation but decides _which_ document Mongo touches, and getting that wrong is silent.
  `src/repositories` joins `stryker.config.json`'s `mutate` list, and `jest.config.json`'s
  `coverageThreshold` gains the same path, since the two are meant to stay in step.

    Thresholds move to `high: 80` / `low: 60` / `break: 60` — green at 80 and up, yellow between,
    red and a failing exit code below 60. The gate now answers "has something collapsed" rather than
    "did the number move a little", because the score is a ratio: deleting well-tested code lowers it
    without any test getting worse. The config records how to read that, so the next dip is checked
    against the killed/survived/no-coverage counts before it is called a regression.

- **ts-jest's `TS151002` hybrid-module banner is suppressed** via `diagnostics.ignoreCodes` in
  `jest.config.json`. It prints once per test file, so a full `npm test` emitted 72 lines of it —
  and the pre-commit hook runs that suite. `tsconfig.jest.json` already documents why the fix the
  warning suggests (`isolatedModules: true`) must not be applied here: it stops ts-jest
  downlevelling `await import(...)`, and the dynamic import in `tests/unit/services/products.test.ts`
  then fails under jest's CJS VM.

### Fixed

- **`authService.signup` declared an `imageUrl` parameter it could not accept.** The signature said
  `string | null`, the contract declares a string, and a null reaches zod as "expected string,
  received null" — so the `?? ''` fallback it appears to guard was unreachable for the only value
  that would have needed it. Narrowed to `string | undefined`, which is what the sole caller has
  always passed (`post-signup` coalesces a body-supplied null away before calling). Found by a new
  test written against the declared type rather than against the implementation.

- **Nine controllers ended their promise chain with `.then()` and no `.catch()`**, so any
  rejection reached the global handler and was reported as a generic 500 — including ordinary
  client errors. The global handler now consults `databaseErrorInterpreter` and answers 4xx for
  the failures that describe the request, falling through to the opaque 500 for anything it does
  not recognise. Fixed there rather than in the nine controllers deliberately: it covers the ones
  that exist, the ones added later, and every path that forgets a `.catch()`.

- **Controllers no longer echo `error.message` into the user-facing `errors[]` array.** Eighteen
  of them did, which both leaked internals (driver text naming encodings, hosts, filesystem
  layout) and violated this repo's own i18n rule that `errors[]` is translated user-facing copy.
  They now share `rejectDatabaseError`, which takes the status from the interpreter and sends
  nothing about a 5xx to the client.

- **`middlewares/authorizations.ts` bypassed the `auth-jwt` barrel**, importing `verifyAccessToken`
  through it and `verifyRefreshToken` straight from `./token` — while the barrel's own docblock
  claimed "nothing imports those two directly". The claim was already false. It is now true, and
  enforced by a test that scans `src/` rather than by prose.

- **`sumLineItems` could return `NaN` after all**, which is exactly what its docblock promised it
  would not. `Number(x) || 0` rejects `NaN` because `NaN` is falsy — but `Infinity` is truthy and
  passes straight through, and `Infinity * 0` is `NaN`. One line with an infinite quantity and an
  unpopulated product therefore poisoned an entire order or cart total, and a `NaN` total reaches
  the customer as a blank price.

    Found by `tests/unit/infrastructure/totals.property.test.ts` on its seventh generated case; the
    counterexample was `{ quantity: Number.POSITIVE_INFINITY }` with no `product`. Reachable
    rather than merely conceivable: BSON stores `Infinity` happily, order items arrive as raw
    aggregate output, and nothing between the database and the sum re-validates them. The
    coercion is now finite-checked.

- **A password-reset token and an account-deletion token were interchangeable at the lookup layer.**
  `findByPasswordResetToken` filtered on `{ 'tokens.token': token, 'tokens.type': 'password' }` —
  two dotted paths, which Mongo applies to the array _independently_, so it matched a user holding
  the value in one entry and the type in another. A user with both kinds of token, which is the
  ordinary state during an account deletion, was therefore returned by a lookup for either type.
  Both controllers happened to re-check the type on the returned document, so it was not reachable
  as a privilege escalation — but the guard was theirs, not the function's, and a third caller would
  not have inherited it. Now `$elemMatch`, which requires both conditions on the same entry.

- **Concurrent logins silently lost sessions.** `tokenAdd`/`tokenRemoveAll` mutated the loaded
  `tokens` array and called `save()`, which writes the whole array as it looked at load time — so
  two simultaneous logins each wrote N+1 tokens and the second erased the first. Logging in on two
  devices at once was enough. The user saw a successful login followed by a request that said they
  were not authenticated, with nothing erroring on either side. Now atomic `$push`/`$pull`, which
  mongod evaluates against the document at write time, so N logins produce N tokens.

- **Concurrent logins issued the _same_ refresh token.** The payload is `{ id }` and JWT's own
  claims are second-resolution, so signing twice within a second for one user produced byte-identical
  tokens: two devices sharing one credential, stored as two rows holding the same string, where
  revoking either revoked both. Refresh tokens now carry a random `jti`.

- **Two simultaneous uses of one password-reset link both succeeded, and one of them 500'd.**
  `reset-confirm` saves the same loaded document twice (password, then token consumption), so the
  second `save()` to arrive hit a `VersionError` that the controller's blanket catch reported as a
  500 — on a request that had already worked. Consuming the token is now an atomic `$pull` that
  reports whether _this_ caller spent it, and that is what decides the race; the loser gets the same
  422 an invented token would get. Validation moved ahead of consumption so a mistyped confirmation
  cannot burn the link.

- **`npm run lint` failed while a mutation run was in flight.** Stryker copies the whole project
  into `.stryker-tmp/sandbox-*`, and eslint collected the copies — one parser error per generated
  file, 350 of them, because they sit outside the `tsconfig` project `parserOptions.project`
  resolves against. A crashed run leaving the directory behind made it permanent.
  `jest.config.json` already ignored that path for the same reason; `eslint.config.ts` now does
  too.

- **Docs and comments that described code which no longer exists.** Five broken references and
  four passages of narrative history, all found by walking every path mentioned in a tracked file
  and checking it resolves — in this repo or in the paired frontend, since several are deliberate
  cross-repo pointers.

    Broken: `src/infrastructure/observability/analytics.ts` and `tracer.ts` pointed at `docs/guide/*.md`, a
    directory this repo does not have (they mean `docs/tools/posthog.md` and
    `docs/tools/opentelemetry.md`); `stryker.config.json` named `tests/contract/request-contract.ts`
    without its `.test` infix; `docs/api/endpoints.md` claimed `POST /cart/checkout` "fires a
    RabbitMQ event for downstream processing", which it has not done since the domain event bus was
    dropped — it records a metric and emits a PostHog event.

    Rewritten to present tense, keeping the reasoning and dropping the chronology:
    `docs/tools/events-and-logging.md` opened its "no in-process event bus" section by narrating the
    bus's deletion; `docs/tools/redis-cache.md` explained the cache key with a Before/Now table;
    `docs/tools/contract-request-data.md` and `docs/tools/testing-and-docs.md` each justified a
    current design by what preceded it; `tests/contract/request-contract.test.ts` listed four past
    findings as history, when what makes them worth keeping is that all four mechanisms are still
    live. `stryker.config.json`'s mutation-score history is gone outright — three superseded
    measurements, one of them naming a file that no longer exists.

- **A cart line pointing at a deleted product lost the id of the product it pointed at.**
  `populate('cart.items.product')` replaces the stored `ObjectId` in place, and writes `null` there
  when the reference resolves to nothing. `toIdString` then read the id back off that same field and
  returned `''`, so `GET /cart` answered `{ productId: '', quantity }` — a line no client can act on,
  against a `CartItem` schema that requires `productId`. Checkout fared worse: `orderConfirm` handed
  the populated items straight to `orderRepository.create()`, embedding `product: null` in the order
  and persisting an order that does not satisfy its own contract.

    The id is captured before the join now, so a dangling line keeps its `productId` and reports
    `product: null`. Checkout rejects `404` instead of storing the hole, matching what
    `@services/orders` `create()` already does for a product id that resolves to nothing.

    Reaching this took a cart line whose product was deleted without going through
    `productRemoveFromCartsById` — both the hard and the soft delete path call it — so it was not
    reachable through the API alone.

- **`GET /observability/audit` mishandled two of its own query parameters.** `?limit=abc` reached
  `Math.min(NaN, 200)`, and `NaN` survives it — the page size then arrived at the data layer
  undefined. `?limit=-5` passed the upper bound with no lower one to stop it. Both are clamped to
  `[1, 200]` now, matching what `openapi.yaml` declares. Separately, an `?outcome=` outside the
  `success | failure` enum was dropped by an `if` and silently became "no filter", so a typo
  returned everything while looking like a filtered view; it is now dropped explicitly, before the
  query is built.

- **`docs/api/observability.md` described `/observability/events` and `/observability/metrics` as
  public.** They were authenticated in `96c1665` — an admin cookie for the SSE stream, since
  `EventSource` cannot set an `Authorization` header, and a `Bearer $NODE_METRICS_TOKEN` scrape
  credential for the exposition endpoint, which refuses every request with 503 when the variable is
  unset. The page had kept saying otherwise, which is the one kind of documentation error worth
  treating as a defect: it reads as an invitation to expose them.

- **`npm run test:mutation` leaked ~200 MB of `/tmp` per killed worker, and eventually took the rest
  of the machine with it.** Every test file that calls `setupTestDb()` starts a
  `mongodb-memory-server` whose data directory is a ~201 MB `mongo-mem-*` under `os.tmpdir()`.
  `MongoMemoryServer.stop()` removes it, so a normal `npm test` leaves nothing behind — but Stryker
  SIGKILLs a jest worker per timed-out mutant and again at the end of a run, and a killed worker
  never reaches `stop()`. A few runs filled a 16 GB tmpfs, at which point _everything_ on the
  machine that writes to `/tmp` starts failing with ENOSPC, most of it nothing to do with this
  project. A jest `globalSetup` (`tests/helpers/global-setup.ts`) now sweeps stranded directories
  once per jest instance rather than once per worker. It removes one on either of two verdicts: its
  `mongod` is provably gone — the child exits cleanly with its parent and truncates `mongod.lock`,
  so an empty lock or a dead pid is positive evidence, not merely absent evidence of life — or it is
  older than an hour, the backstop for what the lock cannot answer. The first is what lets a long
  run reclaim its own strandings while it is still going; both exist so a concurrent instance's live
  `dbpath` is never deleted out from under it, which would trade a disk leak for an unexplainable
  flake.

- **`npm run test:mutation` could not start at all.** Stryker's `ignorePatterns` excluded `public/**`
  from the sandbox it copies the project into, and `tests/unit/db/seed-fixtures.test.ts` asserts that
  every seed fixture's `imageUrl` resolves to a file committed under `public/images/seed/`. In the
  sandbox those files did not exist, so the assertions failed and Stryker refused to mutate anything
  ("There were failed tests in the initial test run"). The two changes were made two days apart and
  neither is wrong on its own; a plain `jest` run reads the real working tree, where the images are
  there, which is why `npm test` stayed green throughout. `public/` is copied into the sandbox again
  — `.gitignore` already keeps runtime uploads out of it, and the committed remainder is under a
  megabyte.

- **Every custom validation message was discarded, and clients got Zod's English defaults.** The
  Zod schemas called `t()` at module scope, and ES module semantics guarantee every import is fully
  evaluated _before_ the first statement of `app.ts`'s body — where `i18next.init()` lives. `t()`
  returned `undefined`, Zod read `{ message: undefined }` as "no custom message supplied", and used
  its own. `en.json` had defined "Not a valid email" all along and it never reached anyone. Messages
  are now thunks (`error: () => t('…')`), which Zod calls at parse time. No test caught it because
  `tests/helpers/setup.ts` runs in Jest's `setupFiles`, so under test i18n _was_ up when `t()` ran —
  the same code had two behaviours. `tests/unit/i18n/validation-messages.test.ts` reproduces the
  live ordering instead of Jest's.

- **Multipart requests were answered in the wrong language, and said otherwise.** `upload.single()`
  consumes the request stream, so the rest of the chain resumes from a socket read callback whose
  async context predates the locale middleware — the `AsyncLocalStorage` store is gone and the
  ambient `t` silently falls back to the boot language. The response still carried
  `Content-Language: it`, because the header is set by the middleware, which does run. `POST
/account/signup` is multipart, so this was the user-visible path. Fixed at the source in
  `core/adapters/storage.ts`, where every `upload.*` method is wrapped to re-enter the store,
  rather than at the seven route mounts — a route that forgets the wrapper looks perfectly correct
  and fails only in a language nobody tests in.

- **The supported-locale list could disagree with itself.** `i18next.init()` registered its
  resources once at boot while the middleware re-read `src/locales/` per request, so dropping in a
  dictionary on a running server made the negotiator offer a language i18next could not resolve —
  again answering `Content-Language: xx` with fallback copy. The list is memoised, so the two
  cannot drift; adding a locale needs a restart, which a deploy does anyway.

- **Redis could serve one language's response to another.** `setCache` keyed on method + URL + user
  scope, and bodies carry translated `message` / `errors` copy. The locale is now part of the key,
  and `Vary: Accept-Language` is set for caches in front of the API — the same fault the
  `Vary: Authorization` fix in this release describes, with a different header.

- **`tests/helpers/contract-data.ts` ignored `pattern` entirely**, so `validPayload()` could emit a
  value the contract declares illegal and the resulting `422` looked like an endpoint bug. It now
  refuses to return a value it knows violates a pattern, naming the fix in the error.

- **Cached responses were reused across authentication scopes, so an admin was served the anonymous
  list.** `setCache` scoped its Redis key by user id and set `Cache-Control: public|private,
max-age=N`, but never named `Authorization` in `Vary` — and a cache keys on method + URL + the
  headers `Vary` lists, nothing more. A browser's stored copy of an anonymous
  `GET /products?page=1&pageSize=10` therefore matched an admin's request for the same URL and was
  answered from local storage, the request never reaching the API: the admin saw the 3 public
  products under an admin header, with per-row Edit and Delete rendered from a `no-store`d
  `GET /account` that _was_ live, and nothing left to re-fetch. `GET /account` carried the same
  fault — it re-enables caching over the router's `noStore` — serving one user's profile to the
  next within the TTL and flipping `isAdmin` for whoever asked after. Now
  `response.vary('Authorization')`, appending so the `Vary: Origin` that CORS sets survives;
  `getAuth` derives `authContext` from that header alone and never from a cookie, so it is the
  entire scope key. By design, an authenticated response now keys on a rotating bearer token and is
  effectively uncacheable in the browser, while anonymous traffic — the volume worth caching — still
  shares one entry. The Redis cache is untouched, having always been scoped correctly.

- **Why the above took so long to find**, recorded because the next caching bug will do the same
  thing. It is the cause of three of the paired frontend's five live-profile e2e failures, and every
  attempt to observe it destroyed it: `cy.intercept` proxies a request to the network and so
  bypasses the browser cache, making the failing test pass whenever it was instrumented — which read
  as a timing race for weeks. For the same reason every `curl` check exonerated the API correctly
  and uselessly: curl has no cache, and the API's answers were never wrong; the question simply
  never reached it. Proven in the end by controlled A/B against the live stack — with the line
  removed exactly one e2e test fails, `Found '3', expected '5'`; with it restored the live suite is
  63/63, up from 58 passing / 5 failing.

- **The app container reported `unhealthy` permanently, including straight after a clean rebuild.**
  The healthcheck was `curl -f http://localhost:${NODE_PORT:-3000}/` and the image is
  `node:25-alpine`, which ships no curl — `command -v curl` inside the container returns nothing —
  so the check exited non-zero every time while the API answered `200` on `/` throughout. It made
  every genuine health signal invisible and would have deadlocked any
  `depends_on: condition: service_healthy` pointing at the app. Now `node -e` using the built-in
  fetch, which needs nothing added to the image.

- **Auth responses could be served from cache, silently logging the client out.** Express attaches
  an `ETag` automatically, and `GET /account/refresh` declared no cache policy — so a browser
  applied heuristic caching, stored the response, and later revalidated with `If-None-Match`.
  Express answered `304 Not Modified`, which by definition carries **no body** — and that
  endpoint's entire purpose is returning a freshly minted access token _in the body_. The client
  received nothing, left its in-memory token undefined, and issued every subsequent request
  unauthenticated, while still holding a valid refresh cookie so the UI went on showing the user
  as signed in. Intermittent by nature: a JWT embeds its issued-at second, so two refreshes inside
  the same second produce byte-identical bodies, the same ETag, and the 304. Now `Cache-Control:
no-store` on the whole account router via `noStore` (`src/middlewares/cache.ts`), which also
  strips inbound `If-None-Match`/`If-Modified-Since` so a non-compliant client or intermediary
  cannot force a 304 either. `no-store` rather than `no-cache`: the latter permits storing and
  merely requires revalidation, which is exactly the path that breaks this. Routes that genuinely
  want caching still override it — `GET /account` keeps its `setCache`. Verified at the HTTP
  level: forced revalidation returned `304`/0 bytes before, `200`/233 bytes after.
- **Paginated lists had no total order, so pages could repeat or skip rows.** `DEFAULT_SORT` was
  `{ createdAt: -1 }` on a column that is not unique — a seed, a bulk import or two concurrent
  creates land in the same millisecond — and MongoDB does not order ties. Two identical queries
  returned different orders against the real API. Because `paginatedSearch` issues `count` and
  `findAll` as separate queries, a shifting tie order could return a document on page 1 _and_
  page 2, or on neither. Now `{ createdAt: -1, _id: -1 }`: `_id` is unique, so the sort is total
  and paging is stable.

- **This repository's git hooks had never run.** `.husky/pre-commit` and `.husky/commit-msg` were
  both present and both inert: `husky` was not a dependency, there was no `prepare` script to
  install it, and `core.hooksPath` was unset, so `.git/hooks/` held nothing but samples. Neither
  the pre-commit gate nor commitlint had ever fired on a commit here — the hook files read as
  protection that was not there. The frontend was wired correctly, which is what made the
  difference visible: an identical commit took seconds in one repo and minutes in the other.

- **The API answered validation errors with raw i18n keys.** `src/models/user-validation.ts` asked
  for `signup.user-field-*` while `src/locales/en.json` defined them under `login.*`, and i18next
  returns the key itself when it cannot resolve one — so a user with a malformed email was told
  `"signup.user-field-email-invalid"`. `src/models/products.ts` had the same fault against
  `ecommerce.product-invalid-*`. The existing tests could not see either: they asserted only that
  the error list was non-empty, and a raw key is a perfectly good non-empty string. Keys and
  references now agree, and both validation suites assert that no message is shaped like a dotted
  identifier — a check that survives the copy being reworded.
- **`POST /users` answered `500` for a wrong-typed `admin` field.** `validateData` applied the
  schema through a `.pick()` of three fields, so `admin`, `active` and `imageUrl` were not checked
  at all — the string reached Mongoose, which threw a CastError on save, which the controller
  mapped to `500`. Malformed input told the client the server was broken, and reached the
  persistence layer to do it. It now gets the `422` the contract promises.
- **A multipart form that _unchecked_ `active` turned it on.** The coercion was
  `!!request.body.active`, and `!!'false'` is `true` because every non-empty string is truthy.
  Multipart booleans are now decoded against the spellings forms actually send.
- **A partial update wiped `categories` and `tags`.** `coerceStringArray(undefined)` returns `[]`,
  which `productService.update` reads as "the caller sent an empty list" rather than "the caller
  did not mention this field" — so a `PUT /products/{id}` omitting them cleared whatever was
  stored. An absent field is now left absent, on both transports.
- **`price` below its declared `minimum: 0` was accepted.** `zodProductSchema` overrode `price` to
  attach an i18n message, and `.extend()` _replaces_ a field — so the override silently dropped the
  contract's minimum, and what it kept was a dead `.refine()` (`z.number()` already rejects `null`
  and `undefined`). Any `.extend()` over a generated schema carries this hazard.
- **The test suite delivered real email through the production SMTP relay.** `tests/` loads the same
  `.env` as the app, the mailer built its transport from it at module load, and `postOrders`
  dispatches with `void enqueueEmail(...)` — so every contract run asked the real mail server to
  deliver from the real sender to generated `@example.com` addresses. The relay eventually refused
  with `550 ... blacklisted`; because the promise is discarded, that surfaced as an unhandled
  rejection attributed to whichever unrelated test happened to be running, which is why the
  reported failure moved between runs. Under `NODE_ENV=test` the transport is now `jsonTransport`,
  which opens no socket.
- **`tests/contract/request-contract.test.ts` is green**, and the contract suites pass 112/112. The
  10 assertions it used to fail were every one a real contract violation rather than a test bug —
  they are the entries above. The file's header now records _how_ each was closed, because the
  answer differed: the spec was wrong about `imageUrl`, the validator was wrong about the rest.

- **Promtail collected nothing under either runtime.** The base compose file mounts no host log
  path by design — each runtime adds its own through `docker-compose.docker.yml` or
  `docker-compose.podman.yml` — but the only documented way to select one was `COMPOSE_FILE` in
  `.env`, and **podman-compose ignores that variable there** (verified against podman-compose
  1.6.0; Docker Compose does honour it). On Podman the override silently never applied: Promtail
  started, tailed nothing, Loki stayed empty and Grafana's log panels stayed blank, with no error
  anywhere. The file list moved into the `podman:*` / `docker:*` npm scripts, which pass it with
  `-f`, so the runtime you get is the script you run and both behave identically. `.env` now only
  needs `PODMAN_CONTAINERS_PATH`, and both override files carry a note against reintroducing
  `COMPOSE_FILE`.
- **`DOCS_PORT` had drifted back to `4173` in the working `.env`**, re-creating the collision the
  host-port map exists to prevent: `4173` is VitePress's own `preview` default, which the paired
  frontend uses on the host. Now `3090`, inside this repo's `3000–3099` block, with the reason
  recorded next to it — the same shape as the earlier `UMAMI_PORT` drift.
- **`extractHardDelete` still crashed on a body-less request.** The express 5 undefined-body fix
  below was applied to `extractCustomId` and `extractAndValidateId` but not to this third reader in
  the same file, so any `DELETE` sent without a body — the shape the frontend uses — went on
  answering 500 through it. Routing every reader through one `getRequestBody()` helper is what
  closes the class rather than the two instances that happened to be found.

- **`DELETE /cart/{productId}` answered 500 on any request without a body.** Express 5 leaves
  `req.body` **undefined** when no body is sent (express 4 defaulted it to `{}`), and
  `extractCustomId` read a property off it unconditionally — before the param/body precedence could
  save it. A body-less delete, which is exactly what the frontend sends, threw
  `Cannot read properties of undefined`. `extractAndValidateId` is hardened the same way, so a
  body-less `DELETE /products` now answers 422 instead of 500.

- **Every templated email was broken.** `mailer.ts` resolved templates via an
  `import.meta.url` shim whose `dirname` was derived from the CommonJS `__filename` it existed to
  replace — the module's own comment admitted it ignored the argument. It resolved to
  `src/views/templates-emails`, a directory that has never existed (templates live at the repo
  root), so signup confirmation, password reset, order confirmation, feedback and account-deletion
  mails all failed to render. Paths now come from `EMAIL_TEMPLATES_DIR`, and
  `tests/unit/infrastructure/adapters/mailer-templates.test.ts` asserts each template resolves to a real
  file.

- **`GET /orders/{id}` returned a different shape depending on the caller's role.** The scoped
  (non-admin) path aggregated the computed totals in; the admin path used a plain `findById` and
  omitted them. `create`/`update` never had them either. The three totals are now derived in
  `applyOrderTransform`, the single serialization point every order response passes through, so all
  four paths agree — which is what allows the spec to mark them required.
- **`GET /products`, `GET /products/{id}` and `GET /orders` returned raw `_id` and `__v`**, so the
  paired frontend's `item.id` reads came back `undefined` and detail links resolved to
  `/products/undefined`.
- **`GET /users` leaked `password` and `tokens`.** Closed by both mechanisms below.
- **The seeder could leave the response cache serving pre-seed data** for the rest of the TTL — up to
  an hour on the old default. `db:seed` now invalidates, and the dev cap bounds the damage from any
  writer nobody has enumerated.
- **`npm run db:cache:clear` reported success with Redis down.** It printed
  `Cache cleared: 0 keys removed.` and exited `0` — indistinguishable from a genuinely empty cache —
  so the documented recovery tool silently no-opped. It now logs
  `Redis is unreachable — the cache was NOT cleared` and exits `1`.
- **`db/` scripts could hang instead of exiting.** A throw skipped `connection.close()` and
  `stopCache()`, leaking both sockets. Teardown moved into `runScript`'s `finally`.
- **`.catch((error) => { throw error; })` in both `db/` entry points** was a no-op that produced the
  same unhandled rejection as having no `.catch` at all. Removed in favour of `runScript`.
- **`adminUpdateById`'s "changes the password" test had been passing vacuously** — it read the
  password back through a finder that no longer selects it. Five tests moved onto the credential
  finders; this one started actually asserting.

- **The `:host` scripts ignored `NODE_MONGODB_NAME` and could seed the wrong database.** Six of
  them spelled out `mongodb://localhost:27017/boilerplate-node-backend` literally, so renaming the
  database in `.env` left every one of them pointing at the old name — silently, and in the
  destructive direction: `db:seed:reset:host` would create and reset a database nobody had
  configured while the real data sat untouched elsewhere, with nothing in the output naming which
  one it had touched. They now blank `NODE_DB_URI` / `NODE_REDIS_URL` and set `NODE_MONGODB_HOST` /
  `NODE_REDIS_HOST` to `localhost`, which is all the host case actually needs: an empty URI makes
  both resolvers fall through to their host/port/name fragments, so everything except the hostname
  still comes from `.env`. That empty-string fall-through is now load-bearing and reads like a bug
  to anyone tidying the resolver, so it is documented at both call sites and pinned by its own test.

- **`migrate-mongo-config.js` read `NODE_DB_URI` raw**, with no host/port/name fallback — which is
  why the `:host` scripts had to write out a full URI in the first place. It now resolves the URI
  exactly as the application does. It cannot import `getDatabaseUri` (CommonJS, loaded by
  migrate-mongo's own resolver, against a TypeScript module), so the five lines are duplicated and
  `tests/unit/db/host-scripts.test.ts` runs both over a six-case env matrix and fails if they ever
  disagree — the duplication is allowed to exist only because that test exists.

- **Uploaded image URLs were stored with Windows path separators, and 404ed.** multer builds
  `file.path` with `path.join()`, so an upload on Windows arrived as `public\images\x.jpg` and
  `resolveImageUrl` persisted it with only the public prefix stripped. A backslash is a literal
  filename character in a URL, so every such row asked `express.static` for a file that does not
  exist. `imageUrl` is now normalised before it is persisted — prefix included, so a posix
  `NODE_PUBLIC_PATH` still matches a backslashed path. `imageUrlRaw` is deliberately left
  platform-native: it is what `deleteFile()` receives, and normalising it too would break upload
  cleanup on Windows, which is this bug inverted.

- **The demo fixtures shipped the same broken URLs**, as ten backslashed `\images\x.jpg` literals,
  so every `db:seed` on every platform wrote image paths that could not resolve. It went unnoticed
  because nothing served `public/` at all until this release. Seeding is idempotent by **skipping**
  an existing `_id` rather than rewriting it, so re-seeding does not repair an affected database:
  `db/migrations/20260806140000-image-url-separators.js` does, across `products`, `users` and the
  embedded product snapshot inside `orders`. Its `down` is deliberately empty — reversing a repair
  means restoring data that 404s.

### Removed

- **`cart` from the user model, and everything that guarded it.** `IUser.cart`, its schema block,
  `ICartItem`, and `omit: ['cart']` in the user serializer — the last of which was the only thing
  keeping a cart out of every user response, since unlike `password` and `tokens` it was never
  `select: false`. With it go `requireUser` and `clearCartItems` in `@services/cart`: nothing loads
  a user to reach their cart any more, and clearing one is a write, not a mutation of a document
  someone else fetched. The four mutating cart controllers lost their follow-up
  `cartGetWithSummary` call, because the mutation now answers with the cart it produced.

    The duplicated cart coverage inside `tests/unit/services/users.test.ts` went with it —
    thirteen tests restating what `tests/unit/services/cart.test.ts` already asserts, which only
    existed because the cart lived in the user document.

- **`src/services/cart.dto.ts`, and the 330-line test that pinned it.** Four of its five exports
  existed to work around one field meaning two things. `ICartItem.product` is declared
  `Types.ObjectId`; `populate()` swaps a product document into it at runtime. Nothing downstream
  could trust the declared type, so `toIdString` took `unknown` and probed four shapes (`ObjectId`,
  `string`, `{id}`, `{_id}` recursively), `toCartProductDto` took `unknown` and rebuilt ten fields
  behind ten `typeof` guards — a hand-rolled copy of what the product model's own `toJSON` already
  produces — and `matchesProductId` in `@services/cart` widened to `unknown` to match, despite both
  of its call sites reaching it through `requireUser`, which does not populate. That one is
  `product.equals(id)` now: a built-in method that accepts a string.

    The fifth, `toUserCartDto`, was built on the same confusion from the other side. It mapped
    _un_-populated items through `toCartItemDto`, documented as handling populated ones, so the
    `product` on every `IUserCartDto` it ever produced was unconditionally `undefined`. Every
    controller discarded its output regardless.

    What earns its place moved into `@services/cart`: the `ICartLine` type, and the
    `{ productId, quantity }` projection that keeps `CartItem`'s `additionalProperties: false`
    satisfied.

- **The in-process domain event bus (`src/infrastructure/observability/events.ts`), and with it the AsyncAPI
  channel `ecommerce.cart.checked_out`.** It described itself as "a decoupling mechanism, not just
  a recording one" and had **zero subscribers** for its entire life — one channel, one emit site in
  `post-checkout.ts`, and an `EventTarget` nothing listened to, which made `emitDomainEvent` a
  `logger.info` behind a typed payload map, a derived name union and a generic emitter.

    It was deleted rather than wired up. In a single service an in-process bus costs the call graph —
    no "find all references", stack traces that stop short of the cause, no type error when a
    listener breaks — and buys none of what a broker gives you: no durability, no retry, no replay, a
    crash mid-dispatch losing the event outright. The three things that would have subscribed are
    better served without it: email already goes through RabbitMQ, which is durable, so an in-process
    hop in front of it can only lose messages; cache invalidation wants the opposite of async fan-out,
    happening immediately after the write in the same process; and most analytics events here are UX
    facts (`product_viewed`, `cart_viewed`) where nothing in the business changed. If cross-process
    fan-out is ever needed the answer is a RabbitMQ topic exchange fed by a transactional outbox, not
    an `EventTarget`.

    `ICartCheckedOutEvent`, `ECOMMERCE_CHANNELS` and `TEcommerceChannel` leave the generated
    `src/types/asyncapi.ts`; types were regenerated with `npm run genasyncapi` rather than
    hand-edited. The paired frontend mirrors the contract and carries the same generated types —
    nothing there imported them. `docs/api/asyncapi-workflow.md` gains the rule this is an instance
    of: a channel is declared for something that crosses a process boundary, not for an in-process
    notification, so a wire nothing travels on is not left described.

- **The 200-entry audit ring buffer**, and `getAuditBuffer` with it. Replaced by the Mongo
  collection above. Keeping both would have meant two stores of the same events, able to disagree,
  with the endpoint reading whichever it happened to be pointed at.

- **The Redis pub/sub cache invalidation, and with it the AsyncAPI channel
  `cache.tags.invalidated`.** It never invalidated anything. The cached responses and their tag
  sets live in shared Redis, so the `SMEMBERS` + `DEL` that the writing instance runs deletes them
  for every instance at once — a peer's next read already missed, before any message could be
  sent. What arrived on the channel made the receiver repeat that work against keys that were
  already gone: `SMEMBERS` on a deleted tag set returns empty, the `DEL` is skipped on the
  `keys.length > 0` guard, and the second `DEL` targets a key that no longer exists. No state
  changed, at the cost of a second Redis connection per process held open for its lifetime, a
  shutdown ordering constraint (`stopCacheSubscriber()` strictly before `stopCache()`), an
  instance-ID self-echo guard, and three round-trips per write per replica. The file already
  carried the argument against it: `clearCache`'s docstring explains that shared keys need no
  broadcast, which is equally true of `invalidateCacheTags`. `broadcastCacheInvalidation`,
  `subscribeCacheInvalidation` and `stopCacheSubscriber` are gone from
  `src/infrastructure/adapters/cache.ts`, along with their boot and shutdown wiring, the
  `CacheTagsInvalidatedPayload` schema, its two messages, and the `redisLocal` server entry.

    **This is breaking for anything generated from `asyncapi.yaml`** — `ICacheTagsInvalidatedPayload`
    / `…Message` / `…ConsumeMessage` and `CACHE_CHANNELS` no longer exist in `src/types/asyncapi.ts`,
    and the paired frontend must regenerate. Nothing subscribed to the channel: a browser cannot
    hold a Redis subscription, and the frontend carried only the generated types, unreferenced.

    The mechanism is not wrong in general — it is wrong without the thing it serves. It becomes
    necessary the moment a worker keeps a **process-local L1 cache** in front of Redis, because then
    a peer holds a stale copy only a message can reach. There is no such tier today; if one is added,
    the pub/sub returns in the same commit, with the test asserting that the receiver's in-memory
    entry is dropped. The two tests deleted here asserted only that a message was published, which is
    how a no-op stayed green. `docs/tools/redis-cache.md` now documents the worker/Redis relationship
    that makes the broadcast unnecessary.

- **`TODO.md`**, added earlier in this same unreleased cycle and now redundant. Both entries it
  carried are settled: the `/tmp` leak is fixed (see _Fixed_), and the remaining image-storage work
  is written where the work is, as the TODO above `imageStore` in
  `src/infrastructure/adapters/image-store.ts` — a file the compiler, the reviewer and the person about to
  change that module all open anyway, unlike a document at the repository root that drifts out of
  step with the code the moment either moves. Nothing was dropped in the move: the consequence of
  deferring it (a container rebuild deletes every uploaded image), the url prefix change, the
  legacy rows that must keep working, and the orphaned-object question all live in that comment,
  with the operational summary in the README's _Uploaded images_ section.

- **The remote image store's configuration**, `NODE_IMAGE_STORE_BUCKET` and its four companions,
  together with the backend selection they drove and the boot check that refused to start without
  an implementation. They described a decision that has not been made — the plan is a personal CDN,
  not necessarily an S3 bucket — and configuration that selects a backend nobody has written is a
  way to get a half-migrated deployment rather than a head start on one. The seam they hung from
  stays: `IImageStore`, its local implementation, and a `imageStore` binding that a second backend
  redirects in one line.

- **The commented-out SendGrid transport block** in `src/infrastructure/adapters/mailer.ts`. It could not have
  compiled if uncommented: `nodemailer-sendgrid-transport` was never a dependency,
  `sendgridTransport` was never imported, and `NODE_APIKEY_SENDGRID` appeared nowhere else in the
  repository. The affordance moved to `docs/tools/email-and-rendering.md`, which records what is
  actually true — SendGrid, Mailgun, SES, Postmark, Resend and Brevo all run SMTP relays, so the
  existing adapter reaches them from `.env` alone, with no code change.
- **`db/migrations/20240101000000-initial-seed-data.js`** — seed data as a migration is a category
  error: it cannot be re-run to refresh a development database, and it hand-rolled `hash(…, 12)`
  instead of going through the schema's pre-save hook. Migrations now own schema, `db:seed` owns
  data.
- **`js-yaml` and `@types/js-yaml`** — no remaining consumer.

- **`orderService.getAll`** and the `orderRepository.findAllAggregated` that backed it. It had no
  production caller — a public service method whose only consumers were its own tests. Those tests
  were the real asset, since they cover the `totalItems` / `totalQuantity` / `totalPrice` fields
  that are derived rather than stored; they moved onto `orderService.search`, which runs the
  identical aggregate-and-normalize path.
- **`extractId` and `extractPagination`** from `core/http/request.ts`. `extractId` was
  `candidates.find(Boolean)` behind a cast, inlined at its three call sites. `extractPagination` had
  no production caller at all: `normalizePagination` re-derived everything it produced.
- **`src/infrastructure/http/scopes.ts`** — its one export moved to `orderService.callerScope`, and its tests
  with it, as `tests/unit/services/orders-scope.test.ts`.

### Security

- **An admin could delete any file the API process could reach, by naming it in `imageUrl`.** Every
  delete of a stored image was `deleteFile((process.env.NODE_PUBLIC_PATH ?? 'public') + imageUrl)` —
  a string concatenation, with nothing between the client's value and the unlink. `imageUrl` is
  client-supplied on `POST`/`PUT /products` and `/users`, the contract declares it
  `uri-reference`, and `/../../etc/passwd` is a perfectly legal `uri-reference`: it passes
  `zodProductSchema` unchanged (verified), is stored, and is unlinked on the next hard delete or
  image replacement. Deleting a stored image now goes through `@infrastructure/adapters/image-store`, which
  resolves the value against the public directory and refuses anything that lands outside it —
  including the public directory itself. Requires the admin write scope, so it is a privilege
  escalation from "can edit the catalogue" to "can delete `.env`", not an unauthenticated hole.

- **The stored filename's extension came from the client.** `resolveUploadFilename` randomised the
  stem but carried `originalname`'s extension over, so valid PNG bytes uploaded as `payload.html`
  were stored as `<random>.html`. Harmless while nothing served the directory — and stored XSS the
  moment anything did, since a static file server derives `Content-Type` from the extension and a
  PNG may legally carry `<script>` in a metadata chunk. Bytes that pass every content check would
  have been served as `text/html` and executed. The extension now comes from the declared type, a
  closed set of `png`/`jpg`/`webp`, and the content check additionally requires the bytes to match
  what was declared.

- **`/observability/metrics` and `/observability/events` were public.** Neither carries user data,
  which is why they were left open, but both are a map of how the service behaves — request
  volumes, error rates, latency percentiles, login success and failure counters, uptime and heap.
  Each is now authenticated, and they use different mechanisms because their callers can:
    - **`/events`** is opened by a browser's `EventSource`, which **cannot set request headers** —
      a limitation of that API, not an oversight — so a bearer token was never available to it.
      It authenticates with the `HttpOnly` session cookie instead, which is what
      `withCredentials: true` on the frontend's client was always for. Verified the same way
      `GET /account/refresh` verifies it, signature _and_ presence on the user document, so
      logging out revokes the stream too. Deliberately not a token in the query string: URLs land
      in access logs, proxy logs, history and `Referer` headers.
    - **`/metrics`** is scraped by Prometheus, which cannot log in or hold a session. It takes a
      static bearer credential — the mechanism `scrape_configs` provides for exactly this — from
      `NODE_METRICS_TOKEN`, compared with `timingSafeEqual`. Unset means the endpoint refuses
      every request: an unauthenticated metrics endpoint is not a state to arrive at by forgetting
      a variable. `.env-example` and `prometheus.config.yaml` both ship a development default, so
      the stack works out of the box; change it with the other secrets.

- **An unauthenticated request could pin a CPU for ~45 seconds.** `addTextFilter` and
  `addRegexFilter` passed client text straight into MongoDB's `$regex`, and MongoDB evaluates the
  pattern server-side against every candidate document. `GET /products?text=(a%2B)%2B%24` needs no
  token, and a catastrophic backtracking pattern costs seconds of CPU per document from a handful
  of characters — measured at 45s for a single match against a 31-character subject. Every
  `$regex` now escapes its input, which is also what a search box means: unescaped, `.` matched
  everything, `^` anchored, and a lone `(` was a syntax error the driver surfaced as a 500, so
  someone searching for `50% (off)` got an error rather than products.

- **An upload's type was decided by the client.** `fileFilter` compared the `Content-Type` the
  client wrote on the multipart part, which nothing verifies —
  `curl -F 'imageUpload=@shell.html;type=image/png'` sets it to anything. Uploads are now
  identified by their leading bytes after the write, and anything that is not a real PNG, JPEG or
  WebP is deleted and the request rejected with `422`. Raw image formats only, deliberately: SVG
  is XML a browser executes, so accepting it means accepting script upload and no amount of
  sniffing makes it safe.

- **Uploads had no size limit at all.** Multer's default is unlimited, so a public endpoint would
  write every byte a client cared to stream, before any handler ran. `NODE_MAX_UPLOAD_BYTES`
  (5 MB default) plus caps on the number of files, fields and parts.

- **A hundred password guesses a minute, from the same budget as browsing.** The global limiter is
  sized for a page of products, and `POST /account/login` inherited it. `authRateLimiter` gives the
  credential endpoints — login, signup, reset, reset-confirm — their own much smaller budget
  (`NODE_AUTH_RATE_LIMIT_MAX`, 10 by default), so raising the global limit for legitimate traffic
  no longer raises the guessing rate with it. Successful attempts do not spend it, so a shared
  address does not lock out its own users for signing in correctly.

- **`trust proxy` is now explicit.** Everything that identifies a caller by address — the rate
  limiter's bucket key, the audit log's `ip` — reads `request.ip`, and behind a proxy that is the
  _proxy's_ address unless Express is told how many hops to count back. Left unset, the per-IP
  limiter degenerates into one shared bucket that protects nothing and lets one busy caller 429
  everyone; set to `true`, `X-Forwarded-For` is client-supplied and the limit is bypassed
  entirely. `NODE_TRUST_PROXY_HOPS` is the number of proxies you actually run, and defaults to `0`.

- **The 500 handler returned the thrown error's own text.** `errors[].message` was `error.message`,
  which is the one place an _unexpected_ error's wording reaches an unauthenticated caller — and
  unexpected is exactly the case where nobody chose it: a driver error naming hosts and ports, an
  ENOENT naming a filesystem layout, a client quoting a URL with a key in it. The client now gets
  a chosen, translated message and the stable `INTERNAL_ERROR` code; the detail is logged with the
  request and trace id, where an operator can act on it and a stranger cannot. Deliberate
  `ExtendedError`s still return the copy their thrower chose.

- **The upload callbacks are now covered by tests.** `resolveUploadDestination`,
  `resolveUploadFilename` and `fileFilter` are the whole of this repo's upload security — a field
  whitelist, a filename never derived from client input (against traversal, collision and
  enumeration), and a type check — and none of it was asserted, because a multer storage engine
  keeps its callbacks to itself. The first two are extracted as named exports for exactly that
  reason. Note `fileFilter` still trusts the client-supplied `mimetype`, which is forgeable; the
  tests pin current behaviour so a move to content sniffing is visible.

- **`Cache-Control: public` on responses whose body depends on the caller** — see _Fixed_. The
  visible symptom was wrong data, but the exposure is the point: `public` invites _shared_ caches —
  a CDN, a corporate proxy — to store one caller's copy and hand it to the next, and in the other
  direction an admin's response, which lists inactive and soft-deleted products, sat in the browser
  under the very URL an anonymous visit reuses. Naming `Authorization` in `Vary` closes both
  directions; `private` alone never did, because it constrains _who may store_ a response and says
  nothing about _which requests it may answer_.
- **The refresh token is no longer accepted from the URL path** — see _Breaking_.
  `getRefreshToken` read `request.params.token` ahead of the cookie, so the weaker source also won
  precedence over the stronger one. It now reads the cookie only.
- **`select: false` on `password` and `tokens`** in `src/models/users.ts`, so the fields are absent
  unless a query explicitly asks — including on paths nobody has audited yet.
- **An allowlist boundary in `applyUserTransform`**, returning exactly the OpenAPI `User` properties.
  `active` is derived from `deletedAt`. New model fields are invisible until deliberately exposed.
- **A regression guard asserting both mechanisms independently**: `JSON.stringify(payload)` must
  contain neither `password` nor `tokens` nor `$2b$`.
- Auditing the other three models for the same over-serialization class found nothing — unlike
  `User`, they carry no credential-shaped fields, and their OpenAPI schemas line up with what the
  models store.

### Known issues

- **`databaseErrorInterpreter`'s CastError branch is inverted** (`src/infrastructure/http/errors.ts`). It
  returns `[Number.parseInt(error.message), error.kind]`, but `.message` is prose and `.kind` is a
  schema type name — so a malformed ObjectId in a URL yields an HTTP status of `NaN` and a message
  of `'ObjectId'`. Pinned by tests named as a known defect rather than silently corrected, since
  the module's own CAVEAT says callers may depend on the current shape. The fix is to swap the two
  and pick a real status (400 is the honest one for an unparseable id).

- **`users.email` has no uniqueness constraint.** `db/migrations/…-initial-indexes.js` creates
  `{ email: 1 }` without `unique: true`, and the schema declares none either, so uniqueness rests
  entirely on the non-atomic `findOne({ email })` check in `authService.signup`. Two concurrent
  signups for the same address can both pass that check and both insert; `login` then does
  `findOneWithCredentials({ email })` and gets whichever document Mongo returns first, so which
  account wins is arbitrary and can change between requests. The fix is a unique index plus
  catching the duplicate-key error as the existing 409.

- **`orderService.getById` returns two different shapes from one signature.** Without a `scope` it
  returns a Mongoose document (identified by `_id`); with one it returns an aggregation piped
  through `applyOrderTransform`, where `_id` has been renamed to `id`. So a caller reading `_id`
  works on the admin path and gets `undefined` on the owner path — role-dependent behaviour that
  survives a green suite because `id` happens to resolve on both (it is a Mongoose virtual).

- **`getFormFiles` contradicts its own docblock** (`src/infrastructure/http/uploads.ts`). It promises
  "present but empty → `undefined` so callers have one falsy case to check", but only the
  `.fields()` branch does it; the `.array()` branch returns `[]`, which is truthy. Harmless today —
  both callers (`validateUploadedImages` and `storeUploadedImages`) test `length === 0` as well as
  falsiness — but hiding that difference is the function's entire reason to exist.

- **`tokenRemoveAll()` is a silent no-op** on a user document whose `select: false` `tokens` were
  never loaded: it filters an empty array and saves nothing. The service layer gets this right by
  reloading through `findByIdWithCredentials` first; any new call site that does not will appear
  to log a user out while leaving every refresh token live.

- The two `openapi.yaml` copies (this repo and the frontend's) are hand-synced. They are byte-identical
  as of this entry, but nothing enforces that — keeping them so is still a manual step on every
  contract change.
- **The image pipeline has not been exercised against a running stack.** The integration suite does
  drive the whole loop over HTTP — upload, take the returned `imageUrl`, `GET` it, assert an image
  content type — but through supertest against the app object, not against a container with a
  mounted volume behind it. The repair migration has likewise been written and never run against a
  live database.
- `.env-example`'s JWT secrets are literal placeholders that `validateRequiredEnvironment` accepts,
  since it only checks for non-emptiness.
- **The `:host` scripts have not been run against a live database since being rewritten.** The
  tests assert the URI each one resolves to — which is the thing that was wrong — but not that
  Mongo and Redis answer on it. Setting `NODE_MONGODB_NAME` to something else and confirming
  `db:seed:host` targets it is still a manual check nobody has performed.
- **The pairing with `boilerplate-vue-frontend` has never been confirmed in a browser.** Both
  stacks up, a real request visible in this API's logs: that check is still outstanding. Everything
  claimed about the pairing rests on `compose config` output, the Vite sources and this suite.
