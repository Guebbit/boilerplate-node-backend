# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

A correctness pass over serialization, seeding, cache invalidation and port allocation, driven by
running this stack against its paired frontend (`boilerplate-vue-frontend`) rather than only against
its own tests.

### ⚠ Breaking

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

### Added

- **`src/core/totals.ts`** — `sumLineItems()` and `toCents()`, the one implementation of "sum a list
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
  `src/services/`, `src/models/`, `src/middlewares/` and `src/core/http/`. It runs in its own
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
  `tests/unit/core/http/{scopes,errors,uploads}.test.ts`,
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

- **`tests/unit/core/http/request.test.ts`** (27 tests), the first unit coverage that file has had.
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
- **`clearCache()`** in `src/core/adapters/cache.ts` — `SCAN` + `DEL` over `<CACHE_PREFIX>:*`,
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
  `tests/unit/core/adapters/cache.test.ts` (six cases over `clearCache`, including the refused
  connection that is the regression gate for the silent-success bug), and
  `tests/unit/db/run-script.test.ts` (seven cases, including that cleanup still runs when the body
  throws).
- **Documentation** — README sections on seeding and the response cache, a _Running on the host_
  table pairing each script with its `:host` twin, `docs/tools/redis-cache.md` _Writes that bypass
  the API_, and `docs/tools/email-and-rendering.md` _Using a hosted provider_.

### Changed

- **The container scripts now select their own compose override.** `podman:*` and `docker:*` share
  a `podman:compose` / `docker:compose` entry point that spells out
  `compose -f docker-compose.yml -f <runtime override>`, replacing the manual `COMPOSE_FILE` step
  in the quickstart. Reach for it directly for one-off subcommands, e.g.
  `npm run podman:compose -- logs -f app`. Prefer these over a bare `compose up`, which runs the
  base file alone and leaves Promtail with nothing to tail.
- **A "Pairing with the frontend" section in the README**, with the table of variables that have to
  line up across the two repos (API port ↔ `VITE_API_URL`, CORS origins ↔ the frontend's dev and
  e2e ports, Alloy and Umami ports ↔ their `VITE_*` counterparts). The shipped defaults already
  match; the table is for when a port moves. It also records why the two stacks are never joined
  into one network: the browser on the host is the only thing that crosses between them, so the
  disjoint host-port blocks are the entire integration contract.
- **Cart summary `total` is now rounded to cents**, like every other monetary figure the API
  returns. It shared its arithmetic with the order totals in every respect except the rounding,
  which only the order side had.
- **`IOrderDocument` no longer inherits the computed order totals, and no longer omits `total`.**
  `total` had already been removed from the generated `Order`, so omitting it was a no-op left
  behind by that change; `totalItems`/`totalQuantity`/`totalPrice` are now omitted instead, because
  they are derived during serialization and never persisted — inheriting them claimed three stored
  fields the schema does not have.
- **The aggregate-to-document transform in `src/services/orders.ts` is written once.** `getAll`,
  `search` and `getById` each spelled out the same `applyOrderTransform` map and double cast; they
  now share `transformAggregatedOrders`.
- **`getAll` only injects `$match: {}` when the caller passes no pipeline stages at all.** It was
  prepended unconditionally, so every real pipeline carried a redundant match-everything stage.
- **`request.body` is read through one guard.** `src/core/http/request.ts` had four readers, each
  coping with express 5's undefined body differently — or, in one case, not at all (see _Fixed_).
  All four now go through `getRequestBody()`.
- **`EMAIL_TEMPLATES_DIR` is a plain conditional** rather than a `path.resolve()` whose base and
  suffix were two separate ternaries on the same environment variable, and `transporter`'s doc
  comment is attached to `transporter` again — the new constant had been inserted between the two.

- **`tsconfig.jest.json` uses `module`/`moduleResolution: node16`**, so subpath exports such as
  `@opentelemetry/semantic-conventions/incubating` resolve. Together with the mailer fix this lets
  the test suites import the real `src/app.ts`, which removed a `moduleNameMapper` stub and let
  `tests/integration/app-health.test.ts` drop the private express app it used to rebuild from
  routers — it now exercises the real middleware stack.

- **`db/seeds/index.ts` is now idempotent and safe to run on every boot.** Each fixture is looked up
  by its fixed `_id` and created only when missing. It goes through the repositories rather than the
  raw driver, so the model's pre-save hook still hashes passwords. It **refuses to run when
  `NODE_ENV=production`**, and it calls `clearCache()` only when it actually created something, so
  the common no-op boot does not churn Redis.
- **`gino@pino.it`'s seed password is now the known plaintext `password`**, hashed by the model hook,
  instead of an opaque bcrypt hash with lost plaintext. Both seed credentials are documented in the
  README: `root@root.it` / `rootroot` and `gino@pino.it` / `password`.
- **`clearCache()` reports reachability rather than swallowing everything.** It still never rejects —
  fail-open is preserved — but fail-open is now a decision each caller makes: the seeder reads
  `reachable` and ignores it for control flow (only choosing which line to log), while
  `db/cache-clear.ts` throws on `!reachable`. `reachable` is `true` when caching is disabled, since
  there is nothing to reach and nothing cached to go stale.
- **The dev TTL cap is applied where the TTL enters the system** (the `setCache` middleware), so
  `Cache-Control: max-age` advertises the lifetime the server will actually honour instead of the
  route's declared one. Routes keep declaring their real production TTLs.
- **`scripts/gen-asyncapi-types.ts` is now the shared implementation**, byte-identical to the
  frontend's copy. It emits a superset — modelina payload interfaces, `I<MessageName>` aliases, the
  `<NAMESPACE>_CHANNELS` constant objects with their `T<Namespace>Channel` unions (what this repo
  imports), and `REALTIME_SSE_EVENT_NAMES` / `ISseEventPayloadMap` (what the frontend imports).
  Channel namespaces are **discovered** from the contract rather than hardcoded, so a new prefix
  generates its own constant group with no script change. The output path comes from `--out`.
- **YAML parsing moved from `js-yaml` to `yaml`**, matching the frontend.
- **`.env` / `.env-example` stay container-first** by design; the README quickstart now leads with
  `podman compose up` and says plainly that the stack is container-first and why.
- **`.gitignore`** no longer excludes `.env-example` (`!.env-example` after the `.env*` rule).
- **`eslint.config.ts` and `.prettierignore`** now ignore `src/types/asyncapi.ts`, which is generated
  output.
- **`src/middlewares/auth-jwt.ts`**'s barrel comment now describes what the module is — the front
  door every consumer imports — rather than calling itself a backward-compatibility shim.

### Fixed

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
  `tests/unit/core/adapters/mailer-templates.test.ts` asserts each template resolves to a real
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

### Removed

- **The commented-out SendGrid transport block** in `src/core/adapters/mailer.ts`. It could not have
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

### Security

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

- **`tests/contract/request-contract.test.ts` fails 10 assertions**, and every one is a real
  contract violation rather than a test bug: the API accepts payloads its own `openapi.yaml`
  declares illegal. `imageUrl` is not validated as a URL on `POST /users`, `POST /products` or
  `POST /account/signup`; `active` and `admin` accept a string where the spec says boolean;
  `categories` and `tags` accept a number; `email` is unvalidated on `POST /orders`; and — the one
  worth fixing first — **`price` is accepted below its declared minimum of 0**, so a negative
  price can reach an order. The other six contract suites are green (58/58). These are exactly the
  "validator laxer than the contract" class that suite was built to catch.

- **`databaseErrorInterpreter`'s CastError branch is inverted** (`src/core/http/errors.ts`). It
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

- **`getFormFiles` contradicts its own docblock** (`src/core/http/uploads.ts`). It promises
  "present but empty → `undefined` so callers have one falsy case to check", but only the
  `.fields()` branch does it; the `.array()` branch returns `[]`, which is truthy. Harmless today —
  the sole caller is `resolveImageUrl`, whose `?.[0]` absorbs both — but hiding that difference is
  the function's entire reason to exist.

- **`tokenRemoveAll()` is a silent no-op** on a user document whose `select: false` `tokens` were
  never loaded: it filters an empty array and saves nothing. The service layer gets this right by
  reloading through `findByIdWithCredentials` first; any new call site that does not will appear
  to log a user out while leaving every refresh token live.

- The two `openapi.yaml` copies (this repo and the frontend's) are hand-synced. They are byte-identical
  as of this entry, but nothing enforces that — keeping them so is still a manual step on every
  contract change.
- Uploaded images 404: files are written to `public/images/`, but nothing mounts them.
- `.env-example`'s JWT secrets are literal placeholders that `validateRequiredEnvironment` accepts,
  since it only checks for non-emptiness.
- The `:host` scripts hardcode the database name, ignoring `NODE_MONGODB_NAME`.
