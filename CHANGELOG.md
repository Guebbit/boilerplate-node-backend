# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

A correctness pass over serialization, seeding, cache invalidation and port allocation, driven by
running this stack against its paired frontend (`boilerplate-vue-frontend`) rather than only against
its own tests.

### ⚠ Breaking

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
  now enforce exactly that through one shared schema (`@core/http/schemas`) and answer 422;
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

### Added

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

    None of the 53 `emitAuditEvent` call sites across 21 files changed. `src/core/**` may not import
    `@repositories/*` (`no-restricted-imports`), so rather than route around the rule,
    `@core/observability/audit` declares an `IAuditSink` port and `app.ts` registers
    `auditLogService.record` against it once the database connects — the same inversion as
    `IImageStore`. Swapping the destination for a log-backend writer later is one line in `app.ts`.

- **`docs/tools/events-and-logging.md`** — the map of every signal the application emits.
  Application log, audit trail, product analytics, metrics, traces, the SSE metrics feed and queue
  jobs are seven separate mechanisms, four of them neighbours in `src/core/observability/` and
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
  no shared cache can hand one language's body to another language's request. `src/core/i18n.ts`
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

- **`npm run complete:fast`** — `ts-check`, `lint`, `prettier:check`, and nothing that takes
  minutes. It is what `.husky/pre-commit` runs; `complete:check` stays the full gate, run by hand
  before pushing.

- **`decodeFormFields()`** in `src/core/http/request.ts`, over `isMultipartRequest()` and
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

- **`total` in the audit response counts every matching event, not the page just returned.** It
  was `limited.length` — the size of the slice — so it always equalled `items.length` and told an
  admin nothing. The admin dashboard has rendered it as a count since it was built. Same field,
  same type, no contract change; the number is now true.

- **`GET /products` now filters by `id`, the parameter it always read.** The query parameter was
  declared `productId` while the controller read `id`, so the generated client sent a name the API
  ignores and filtering the catalogue by id over the GET quietly returned the unfiltered list. The
  paired frontend had built a rename around it — `productId: currentFilters.id`, with a comment
  asserting the opposite of the truth and a unit test pinning the workaround — all of which is now
  gone. `POST /products/search` was unaffected: its body schema always said `id`. Any client
  sending `?productId=` to `GET /products` must switch to `?id=`; it was never being honoured.

- **Four more contract corrections, all widening what the spec declares to match what the API has
  always accepted.** `category` and `tag` are now declared as query parameters on `GET /products`,
  not body-only. `active` and `admin` are declared on `UpdateUserRequest`,
  `UpdateUserByIdRequest` and both multipart variants, which the write controller has always
  decoded, validated and stored (no privilege change — the `/users` router is admin-only
  throughout). `DELETE /products/{id}` and `DELETE /users/{id}` declare an optional
  `HardDeleteRequest` body, carrying only the flag, since `{id}` already supplies the id.
  `GET /feedback` declares the query parameters it reads alongside the body it already declared.
  Every one of these was previously a silent superset: the API accepted input its own contract
  denied, so no generated client could reach it and no contract test could catch a regression.

- **`DELETE /cart/{productId}` stops reading a request body.** The route cannot match without the
  path segment, so the param always won the precedence chain and a body `productId` was
  unreachable rather than merely undocumented. Here the spec was already right and the code was
  making the false claim, so the declaration lost `body` rather than the spec gaining one. No
  behaviour change. `PUT /cart/{productId}` keeps it — `UpdateCartItemByIdRequest` declares it.

- **The Redis cache key is built from declared query parameters instead of the raw URL.** It was
  `request.originalUrl`, so the key depended on how a request was _written_ rather than on what it
  asked for: `?page=1&pageSize=10` and `?pageSize=10&page=1` are the same request and were two
  entries, and query-string order is not stable across HTTP clients — a live cache miss, with a
  second identical Mongo query behind it. Each route now declares a `keyParameters` list, required
  rather than optional because it decides which requests share a response; the three search
  controllers export theirs as `Object.keys(schema.shape)` so it cannot drift from what the
  controller reads, and every path-only route declares `[]`. Arbitrary undeclared parameters stop
  minting entries as a side effect. Nothing about which requests are _kept apart_ changed: path,
  caller scope, locale, repeated values and blank-versus-absent all still separate.

- **Request input is declared per route instead of re-assembled per controller.** `src/core/http/request.ts`
  exposed eleven helpers implementing one idea, and every controller wired a different subset in a
  different order — which is how `hardDelete` ended up reading three sources while `id` read two,
  each with a precedence that lived in prose rather than being expressed once. `readInput` now
  takes that precedence as an argument (`sources`, highest first) along with which fields are
  `ids`, `booleans`, `stringArrays` and `flags`, and `mergeBodyQuery`, `extractRequestPagination`,
  `extractCustomId`, `extractHardDelete` and `decodeFormFields` are gone; `isMultipartRequest`,
  `parseFormBoolean` and `FORM_BOOLEANS` became internal to it. `extractAndValidateId` stays,
  because it _responds_ (422) as well as extracting, and is now built on `readInput`;
  `isValidObjectId` stays for its type guard. The refactor itself changed no behaviour — the
  JSON-body asymmetry, the dropped `undefined` keys and the absent-is-not-empty rule all survive
  intact, guarded by `tests/contract/request-contract.test.ts`, which was not touched. What did
  change is the transport rule's shape: decoding now applies to whichever _sources_ are strings
  by construction (params and query always, a body only when multipart) rather than to the whole
  merged result when the body is multipart, which is what lets `?hardDelete=false` be read as the
  boolean it is. A `params` source that could never fire on the list controllers is no longer
  declared, since a declaration naming a source is a claim about the route. The resulting
  endpoint × parameter table, the rules behind it, and the six ways the controllers and
  `openapi.yaml` still disagree are written down in `docs/theory/request-input.md`.

- **Uploads are staged privately and committed to a store, instead of being written straight into
  `public/`.** multer now writes to `NODE_UPLOAD_STAGING_PATH` (default: a directory under the
  system temp directory), and `storeUploadedImages` hands the finished file to
  `@core/adapters/image-store` once the content check has passed. The local store puts it in
  `NODE_PUBLIC_PATH/images/` and returns `/images/<name>` — the same location and the same stored
  value as before, so nothing changes for a client, a database row or the static mount. What
  changes is _when_ a file is publicly readable: an upload used to be fetchable from the instant
  multer wrote it, which was before its bytes had been checked and before anything had been
  validated, so a file that was about to be rejected was reachable while it was being rejected.
  Now nothing is reachable until the request has earned it. The staging step is also the thing that
  makes storing images outside the container possible at all: a remote store takes a finished file,
  not a stream being parsed. The TODO above `imageStore` records the remaining work, and the reason
  it matters: uploads live inside the container, so rebuilding it deletes every one of them.
  Two smaller consequences: `moveFile` handles the `EXDEV` a staging directory on a different
  filesystem produces (a tmpfs `/tmp` with the public directory on disk is the normal case, not an
  exotic one), and a multi-file upload that partially fails now removes the images it did manage to
  store rather than orphaning them.

- **Stored images are deleted through a storage port, `@core/adapters/image-store`.** Where the
  bytes live is now one module's business: callers hand it the `imageUrl` value and it decides
  whether that names a file under `public/`, an object in a bucket, or nothing it owns. Previously
  five call sites — `productService.update`, `productService.remove` and a `deleteUpload` closure in
  each of the three write controllers — each rebuilt a filesystem path out of an `imageUrl`, which
  is why moving images out of the container read as a rewrite rather than an adapter swap.
  Behaviour is unchanged: the shipped implementation is the same filesystem delete, and an
  S3-compatible one is a second implementation of the same interface. Two consequences worth
  knowing: an absolute URL (the `NODE_DEFAULT_IMAGE_*` defaults) is now recognised as not-ours
  instead of producing a doomed `public/https://…` unlink, and path containment is enforced — see
  _Security_. `resolveImageUrl` returns just the URL now, having previously also handed controllers
  the raw filesystem path purely so they could unlink it.

- **Rate limiting is 100 requests per minute, not 100 per fifteen.** The old budget was a session
  limit wearing a rate limiter's clothes: a single-page app spends 5-15 requests rendering one
  page, and a full pass of the frontend's live e2e suite issues ~150, peaking at 52 in a minute —
  measured, not estimated. An ordinary browsing session tripped it, and a limit a legitimate user
  reaches is worse than none, because the 429 lands on them and reads as the app being broken
  while an attacker simply rotates IPs. The window shrank too: exhausting a 15-minute budget in
  the first two minutes locked the user out for the remaining thirteen, where a one-minute window
  makes the limit a brake on burst rate rather than a quota. Test suites raise the budget 10x
  (`tests/helpers/setup.ts`). Found because the first live e2e run against this API failed 14
  assertions, every one of them a 429 cascade rather than anything the tests were checking.

- **The pre-commit hook runs `complete:fast` instead of `complete:check`.** The full gate runs the
  unit, integration and contract suites — minutes per commit, which is long enough that people
  reach for `--no-verify`, and a hook that gets bypassed protects nothing. CI already runs each of
  those as its own parallel job, where a failure names the job instead of failing one long serial
  script. What a commit hook usefully adds is the class of thing that is merely embarrassing in a
  diff — a type error, a lint error, unformatted code — and that costs about six seconds.

- **`imageUrl` is `format: uri-reference`, declared once as `components/schemas/ImageUrl`** instead
  of `format: uri` repeated at nine sites. The field holds an absolute URL (the schema defaults) or
  a server-relative upload path (`/images/x.png`, which is what `resolveImageUrl` writes) — and
  `uri` permits only the first, so orval generated `zod.url()` and both `src/models/products.ts`
  and `src/models/user-validation.ts` carried a hand-written override putting it back to a plain
  string. The spec now states what the code does and both overrides are gone. Tightening the
  implementation instead was the alternative and is the wrong one: an absolute URL in the database
  bakes the current host into every row, so a domain change or a staging copy strands them (see the
  TODO above `imageStore` in `src/core/adapters/image-store.ts`).
- **`userService.validateData` validates the whole schema** rather than a `.pick()` of
  email/username/password, and takes `unknown` — it is the boundary that _establishes_ the type, so
  a narrower parameter only forces its callers to cast on the way in. `productService.validateData`
  likewise. See _Fixed_.
- **The mailer uses nodemailer's `jsonTransport` under `NODE_ENV=test`.** See _Fixed_.
- **`jest.config.json` ignores `.stryker-tmp/`.** A Stryker run copies the whole project there, so a
  plain `jest` started while one is in flight — or after a crashed run left the directory behind —
  otherwise collects the copies as a second, duplicate suite, competing for the same in-memory
  Mongo and reporting failures against paths that are not the source tree.

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
- **The demo dataset moved to `db/seeds/fixtures.ts`**, leaving `db/seeds/index.ts` as the runner
  that owns the connection, the upsert policy and the production gate. `index.ts` seeds on import,
  so nothing could read the fixtures without also connecting to a database and writing to it —
  which is why they had never been tested. `tests/unit/db/seed-fixtures.test.ts` now asserts every
  fixture `imageUrl` is a rooted URL path with no backslash that resolves to a file the repository
  actually ships.
- **Seed fixture images moved to `public/images/seed/`, and uploads are no longer tracked by git.**
  `public/` is served by `express.static`, so uploads land in a tracked directory — `.gitignore` now
  drops `public/images/*` and negates `seed/`. Separating the two is what lets that stay two stable
  lines instead of a list of filenames to maintain as fixtures change.

- **Repositories declare what they can be filtered by; services stopped writing Mongo queries.**
  Each repository now passes a search spec to `createBaseRepository` — filter key to Mongo path,
  by kind (`objectIds`, `exact`, `regex`, `arrayRegex`, `text`, `ranges`) — and gets a `search()`
  that does filter, count, page and normalize in one call. Three things that had been copy-pasted
  into every service moved down with it: the `new Types.ObjectId(...)` coercion of filter ids (four
  copies), the `.lean()` to `applyXTransform` double cast (three identical copies, three chances to
  forget it), and the soft-delete scoping, which products and users had spelled two different ways.
  `productService.search` went from sixty lines to one, and what remains in it is the only rule that
  was ever product-specific: admins see everything, everyone else sees `publicScope()`. `services/`
  no longer imports `mongoose` at all. The drift this prevents had already happened — `orderService`
  had grown its own hand-rolled pagination, so the 100-item cap existed in two places.
- **`findById` and `findOne` resolve a Promise instead of returning Mongoose's Query builder.** A
  Query escaping the repository lets any caller chain `.select()`, `.sort()` or `.lean()` onto it,
  which is the same layering leak the factory exists to close. The one caller that genuinely needed
  a plain object — the product snapshot embedded in an order, which must keep its `_id` — asks for
  it explicitly through `findByIdRaw`.
- **Order read scoping moved from `core/http/scopes.ts` to `orderService.callerScope`**, and now
  takes the auth context rather than the express `Request`. It builds a database filter, so it had
  no business at the bottom of the dependency graph; the `no-restricted-imports` rule on
  `src/core/**` is what says so. All seven documented properties are unchanged and still asserted,
  including the deliberate throw on a missing or malformed caller id — failing loudly rather than
  quietly widening the scope to every user's orders.
- **`normalizePagination` is the only place page defaults and bounds are decided.** Pagination was
  being normalized twice per request, and only the later one could ever win, so the earlier set of
  defaults was dead weight that read as authoritative. `extractRequestPagination` now returns
  exactly what the caller sent, uncoerced, so `undefined` still means "did not paginate".
  `NODE_SETTINGS_PAGINATION_PAGE_SIZE` moved down with the rest and consequently applies to every
  list endpoint rather than only `GET /feedback`.

### Fixed

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

- **The in-process domain event bus (`src/core/observability/events.ts`), and with it the AsyncAPI
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
  `src/core/adapters/cache.ts`, along with their boot and shutdown wiring, the
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
  `src/core/adapters/image-store.ts` — a file the compiler, the reviewer and the person about to
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

- **`orderService.getAll`** and the `orderRepository.findAllAggregated` that backed it. It had no
  production caller — a public service method whose only consumers were its own tests. Those tests
  were the real asset, since they cover the `totalItems` / `totalQuantity` / `totalPrice` fields
  that are derived rather than stored; they moved onto `orderService.search`, which runs the
  identical aggregate-and-normalize path.
- **`extractId` and `extractPagination`** from `core/http/request.ts`. `extractId` was
  `candidates.find(Boolean)` behind a cast, inlined at its three call sites. `extractPagination` had
  no production caller at all: `normalizePagination` re-derived everything it produced.
- **`src/core/http/scopes.ts`** — its one export moved to `orderService.callerScope`, and its tests
  with it, as `tests/unit/services/orders-scope.test.ts`.

### Security

- **An admin could delete any file the API process could reach, by naming it in `imageUrl`.** Every
  delete of a stored image was `deleteFile((process.env.NODE_PUBLIC_PATH ?? 'public') + imageUrl)` —
  a string concatenation, with nothing between the client's value and the unlink. `imageUrl` is
  client-supplied on `POST`/`PUT /products` and `/users`, the contract declares it
  `uri-reference`, and `/../../etc/passwd` is a perfectly legal `uri-reference`: it passes
  `zodProductSchema` unchanged (verified), is stored, and is unlinked on the next hard delete or
  image replacement. Deleting a stored image now goes through `@core/adapters/image-store`, which
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
