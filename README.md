# Boilerplate Node Backend

TypeScript Node.js backend with Express, JWT auth, Mongoose, and OpenAPI-first tooling.

> CI/runtime baseline: Node.js 22.

## Instructions

- Create `.env` file using the example:
    - `cp .env-example .env`
- Create a MongoDB database and link it using `.env` variables:
    - `NODE_DB_URI`
- Optional: configure Redis for server-side response caching:
    - `NODE_REDIS_URL`
- Link external services using `.env` variables (for example SMTP/email responders on another server):
    - `NODE_SMTP_HOST`, `NODE_SMTP_PORT`, `NODE_SMTP_USER`, `NODE_SMTP_PASS`, `NODE_SMTP_SENDER`
- Optional: use Docker/Podman to run the app and its dependencies.
- Load is generated from outside the process with `npm run test:load` (autocannon) — see [Load testing](docs/tools/load-testing.md).

## Quickstart

> The same thing with the URLs to check, the seeded collections, and where to go next:
> [docs/getting-started.md](docs/getting-started.md).

This stack is **container-first**. The shipped `.env` uses compose service hostnames
(`NODE_DB_URI=mongodb://database:27017/…`, `NODE_REDIS_URL=redis://redis:6379`) because the
things that make this boilerplate worth cloning — Tempo, Loki, Prometheus, Grafana, Alloy,
Umami — only exist inside the compose stack. Running on the host is supported, but it is the
secondary path and has its own scripts (see [Running on the host](#running-on-the-host)).

1. Install dependencies:
    - `npm install`
2. Create env file:
    - `cp .env-example .env`
3. Set required environment variables in `.env`:
    - `NODE_TOKEN_ACCESS`
    - `NODE_TOKEN_REFRESH`
    - The database and Redis URLs already point at the compose services — leave them alone
      unless you are pointing at something external (Atlas, a managed Redis, …).
4. On Podman, set `PODMAN_CONTAINERS_PATH` in `.env` (see `.env-example` → _Promtail Log
   Collection_), and `CONTAINER_ENGINE=podman` if you also have Docker installed. Nothing to set
   on Docker.
5. Bring the stack up:
    - `npm run compose:restart`

Use the scripts rather than a bare `compose up`: each one passes its runtime's Promtail override
with `-f`, which is what gives Promtail a host log path to tail. A bare `podman compose up` runs
the base file only, and its Promtail tails nothing — Loki stays empty and Grafana's log panels
stay blank, with no error anywhere. `COMPOSE_FILE` in `.env` does not fix this: podman-compose
ignores it there.

That is the whole quickstart. The `app` container runs `npm run db:bootstrap` before starting
the server, so the database is migrated and seeded on first boot and you get a browsable API
with demo products, users and orders rather than empty lists. Both halves are idempotent, so
later boots are a no-op — see [Database migrations & seeding](#database-migrations--seeding).

### Running on the host

`npm run dev` on its own will **not** work against the shipped `.env`: the hostname `database`
only resolves inside the compose network. Prefix the script with `npm run host --`, which
redirects the **hostname** to `localhost` and changes nothing else (the compose files publish
Mongo and Redis on the `NODE_MONGODB_PORT` / `NODE_REDIS_PORT` from your `.env`, so start the
stack — or at least those two services — first):

| Container-first (default)   | Host equivalent                     |
| --------------------------- | ----------------------------------- |
| `npm run dev:docker`        | `npm run host -- dev`               |
| `npm run db:migrate:up`     | `npm run host -- db:migrate:up`     |
| `npm run db:migrate:down`   | `npm run host -- db:migrate:down`   |
| `npm run db:migrate:status` | `npm run host -- db:migrate:status` |
| `npm run db:seed`           | `npm run host -- db:seed`           |
| `npm run db:seed:reset`     | `npm run host -- db:seed:reset`     |
| `npm run db:cache:clear`    | `npm run host -- db:cache:clear`    |
| `npm run db:bootstrap`      | `npm run host -- db:bootstrap`      |

Mechanically, `host` **blanks** `NODE_DB_URI` / `NODE_REDIS_URL`, sets
`NODE_MONGODB_HOST=localhost` / `NODE_REDIS_HOST=localhost` via `cross-env`, and ends in
`npm run` so npm appends whatever follows `--`. An empty URI makes both resolvers fall through to
their host/port/name fragments, so everything except the hostname — the database **name** above
all — still comes from your `.env`. There is no second env file to keep in sync, and nothing is
duplicated.

That indirection is the point. These scripts used to spell out
`mongodb://localhost:27017/boilerplate-node-backend` in full, six times. Renaming the database in
`.env` then left every `:host` script pointing at the old one, silently: seeding would create and
populate `boilerplate-node-backend` while your actual data sat untouched somewhere else, and
nothing in the output said which database it had touched. Then the URI came out and seven `:host`
twins carried the same `cross-env` prefix instead — where `db:cache:clear:host` had already
drifted, blanking Redis but not Mongo. One wrapper cannot drift from itself.
`tests/unit/db/host-scripts.test.ts` fails if a literal URI, a database name, or a second
hostname-redirecting script comes back.

If you genuinely want the host to be your primary environment, edit `.env` to use `localhost`
and let compose override the two hostnames in its `environment:` block instead.

## Host port map

This repo owns the **`3000–3099`** host-port block, plus the well-known ports of the
infrastructure images it runs. The paired frontend owns **`8080–8099`**. Keeping the two blocks
disjoint is what lets both stacks be up at the same time — they previously collided on `4173`,
where this repo's docs container, the frontend's docs container and the frontend's e2e vite
server all wanted to live.

| Service                      | Host port         | Env var                                           |
| ---------------------------- | ----------------- | ------------------------------------------------- |
| API                          | `3000`            | `NODE_PORT`                                       |
| Grafana                      | `3001`            | `GRAFANA_PORT`                                    |
| Umami dashboard / tracker    | `3080`            | `UMAMI_PORT`                                      |
| Docs (VitePress + Nginx)     | `3090`            | `DOCS_PORT`                                       |
| Loki                         | `3100`            | `LOKI_PORT`                                       |
| OTel Collector (HTTP / gRPC) | `4318` / `4317`   | `OTEL_OTLP_HTTP_PORT` / `OTEL_OTLP_GRPC_PORT`     |
| RabbitMQ (AMQP / management) | `5672` / `15672`  | `RABBITMQ_AMQP_PORT` / `RABBITMQ_MANAGEMENT_PORT` |
| Redis                        | `6379`            | `NODE_REDIS_PORT`                                 |
| Prometheus                   | `9090`            | `PROMETHEUS_PORT`                                 |
| Alertmanager                 | `9093`            | `ALERTMANAGER_PORT`                               |
| Alloy (Faro receiver / UI)   | `12347` / `12345` | `ALLOY_FARO_PORT` / `ALLOY_UI_PORT`               |
| MongoDB                      | `27017`           | `NODE_MONGODB_PORT`                               |

New services belong inside `3000–3099`. Every entry is overridable through the env var in the
right-hand column if a port is already taken on your machine.

> `DOCS_PORT` must not be set back to `4173`. That is VitePress's own `preview` default, which
> the paired frontend uses on the host — it is the exact collision this port map exists to avoid.

## Pairing with the frontend

Start **this** stack first, then the frontend's: it owns the API, plus the Alloy Faro receiver
and Umami that the frontend's browser code posts to.

The two stacks stay **independent** — separate compose projects, separate networks, and nothing
to join. The only thing that crosses the boundary is the user's browser, running on the host: it
resolves the frontend's `VITE_API_URL` itself, so the frontend always addresses this API through
a **host** port (`http://localhost:3000`), never a compose service name. That is why the two
disjoint port blocks are the entire integration contract.

What has to line up:

| This repo (`.env`)                           | Frontend (`.env`)                    |
| -------------------------------------------- | ------------------------------------ |
| `NODE_PORT=3000`                             | `VITE_API_URL=http://localhost:3000` |
| `NODE_CORS_ORIGIN` contains `:8080`, `:8085` | dev server `8080`, e2e server `8085` |
| `ALLOY_FARO_PORT=12347`                      | `VITE_FARO_URL=…:12347/collect`      |
| `UMAMI_PORT=3080`                            | `VITE_UMAMI_SRC=…:3080/script.js`    |
| `UMAMI_WEBSITE_ID`                           | `VITE_UMAMI_WEBSITE_ID` (same UUID)  |

The shipped defaults on both sides already match; the table is for when you move a port.

## Database migrations & seeding

Two tools, two non-overlapping jobs:

|                        | Owns                                                    | Command                 | Re-runnable?                           |
| ---------------------- | ------------------------------------------------------- | ----------------------- | -------------------------------------- |
| `migrate-mongo`        | **schema** — indexes, collection options, field renames | `npm run db:migrate:up` | yes, tracked in `migrations_changelog` |
| `db/seeds/fixtures.ts` | **demo data** — users, products, orders                 | `npm run db:seed`       | yes, upserts by fixed `_id`            |

`npm run db:bootstrap` runs both, in that order, and is what the compose `app` service executes
before starting the server.

- The seeder **refuses to run when `NODE_ENV=production`**.
- Passwords in the seed file are plain text; the model's `pre('save')` hook hashes them. Never
  paste a pre-computed hash there — it drifts from the hook and its plaintext gets lost.
- Seed credentials: `root@root.it` / `rootroot` (admin) and `gino@pino.it` / `password`.
- `npm run db:seed:reset` drops the database first, for when you want a clean slate.
- The dataset lives in `db/seeds/fixtures.ts` (data, no side effects); `db/seeds/index.ts` is the
  runner that holds the connection, the upsert policy and the production gate. Split so the
  fixtures can be read — by a test, or by you — without connecting to a database and writing to it.
- Re-running the seeder **skips** a fixture whose `_id` already exists; it does not rewrite it. To
  repair rows an earlier version seeded badly, run the migrations, or `db:seed:reset` for a clean
  slate.

### Uploaded images

An upload takes two steps. multer writes it to a **staging** directory that nothing serves
(`NODE_UPLOAD_STAGING_PATH`, by default under the system temp directory); once its bytes have been
confirmed to be the image type they claim, `storeUploadedImages` commits it to the **image store**.
Nothing is publicly readable in between — an upload that is about to be rejected is never fetchable
while it is being rejected — and the split is also what lets the second step be something other
than a directory.

The store that ships puts the file in `public/images/`, which `express.static` serves (see
`src/app.ts`) and `.gitignore` drops — a served directory must not accumulate strangers' files in
your git history — and returns `/images/<name>`, which is what lands in `imageUrl`.

`@infrastructure/adapters/image-store` is the only module that may turn an `imageUrl` into a path. That is the
rule that keeps the destination swappable, and it matters because of what local storage means:
**uploaded images live inside the container, so removing or rebuilding it deletes them** — `docker
compose down -v`, a redeploy, a move to another host. Only `public/images/seed/` survives, being
committed to the repository. Two replicas do not share what they store either: an image uploaded to
one is a 404 on the other. Bind-mounting the directory is the stopgap; storing images somewhere
outside the container is the fix, and it is a second implementation of the two methods in that file
— see the TODO there, which records the key layout, the url prefix change and the questions to
settle first.

The demo images the fixtures reference are the exception to the ignore rule: they are repository
content and live in `public/images/seed/`, which is negated in `.gitignore`. Keeping them in their
own directory is what lets one rule ignore uploads without enumerating which files are fixtures.

Stored `imageUrl`s are **URL paths** — forward slashes, always, whatever platform wrote them. The
store builds the value from the object's name rather than deriving it from a filesystem path, so a
separator cannot reach a row at all. It could before: multer builds `file.path` with `path.join()`,
so an upload on Windows arrived backslashed and was persisted that way. A backslash in a URL is a
literal filename character, so such a row points at a file the server will 404 —
`db/migrations/20260806140000-image-url-separators.js` repairs any stored before this was fixed.

### Seeding and the response cache

The API clears its own cache on every write it handles — `POST /products` invalidates the
`products` group, and so on. Writes that **skip the API** cannot do that: `db:seed`,
`migrate-mongo` and any `mongosh` session go straight to Mongo, so cached answers survive them
and `GET /products` keeps serving the pre-seed list.

Two things stop that from biting:

1. **The seeder clears the cache itself** when it actually created something, so a fresh
   `compose up` never shows stale empty lists. Run `npm run db:cache:clear` by hand after any
   manual database surgery. It is scoped to `NODE_REDIS_CACHE_PREFIX` — never `FLUSHALL` — so a
   shared Redis is safe.
2. **TTLs are capped outside production.** Routes declare their own lifetime
   (`setCache(3600, …)` on `GET /products`), but when `NODE_ENV !== 'production'` it is clamped
   to `NODE_REDIS_CACHE_DEV_TTL_MAX` (default `30`s). That bounds the damage from _any_
   out-of-band writer, including ones nobody has thought of yet. Set it to `0` to use the
   declared TTLs everywhere.

The two callers treat an unreachable Redis differently, on purpose. **Seeding fails open** — it
logs a warning and still succeeds, because a stack whose Redis is not up must still be seedable.
**`db:cache:clear` fails closed** — it logs the reason and exits `1`, because clearing the cache
is its entire job, and a manual recovery tool that reports success while doing nothing is worse
than no tool at all: you stop looking for the cause.

The genuinely complete answer is to have the database announce its own changes — MongoDB change
streams, or CDC via Debezium — so _any_ write invalidates regardless of who made it. That needs
a replica set this compose file does not run, and is more machinery than a boilerplate wants.

## Redis caching

- Redis is a super-fast in-memory key/value store.
- "In-memory" means it keeps data in RAM, so reads/writes are usually much faster than going back to the database every time.
- In this project, Redis is used as a temporary response cache for GET requests.
- Simple idea: if the same GET request happens again, the API can answer from Redis instead of rebuilding the response from scratch.

### Small visual

```text
First GET request
Client -> Express -> MongoDB -> Response
                  -> Redis saves a copy

Next same GET request
Client -> Express -> Redis -> Response
                  -> MongoDB skipped

Write request (POST/PUT/PATCH/DELETE)
Client -> Express -> MongoDB update -> related Redis cache cleared
```

### What this project stores in Redis

- A cached JSON response body
- The HTTP status code for that response
- Tags like `products`, `orders`, or `users` so related cache entries can be deleted together
- A user-aware scope, so one user's private response is not served to another user

### Why this helps

- Faster repeated reads
- Less repeated work for the API
- Less unnecessary database traffic
- Safer private caching because auth-related responses are scoped per user

### Safety behavior

- Cacheable GET routes now use Redis-backed server-side response caching when `NODE_REDIS_URL` is configured.
- Cache entries are scoped per authenticated user to avoid cross-user data leakage.
- Product, order, user, account, and checkout mutations invalidate related cached responses automatically.
- If Redis is unavailable, the API continues without server-side caching.

## Internationalization (i18n)

Every response's user-facing copy is chosen per request from the client's `Accept-Language`
header. There is no global "current language" the API holds between requests.

### How it works

| Piece        | Where                        | Job                                                                                                                                                        |
| ------------ | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| dictionaries | `src/locales/*.json`         | one file per language; the directory listing IS the supported list                                                                                         |
| negotiation  | `src/middlewares/locale.ts`  | picks the best supported language, sets `request.locale` / `request.t`, answers with `Content-Language` and `Vary: Accept-Language`                        |
| ambient `t`  | `src/infrastructure/i18n.ts` | an `AsyncLocalStorage`-backed re-export of `t`, so anything on the request's async chain resolves in that request's language without `t` being passed down |

Adding a language is one step: drop `src/locales/xx.json` next to `en.json`. `i18next.init()`
and the negotiator both read the same directory. `NODE_SUPPORTED_LOCALES` overrides the listing
if you want to ship a dictionary without exposing it yet; `NODE_DEFAULT_LOCALE` and
`NODE_FALLBACK_LOCALE` are the out-of-request and no-match languages.

```
POST /account/signup   Accept-Language: it     → "Email non valida"     Content-Language: it
POST /account/signup   Accept-Language: de     → "Not a valid email"    Content-Language: en
```

### Two rules that are easy to get wrong

**Never `i18next.changeLanguage()` per request.** It mutates one global instance and it is async,
so two overlapping requests in different languages answer each other's. Use the ambient `t` (or
`i18next.getFixedT(locale)` directly). `tests/integration/locale.test.ts` fires 20 interleaved
requests in alternating languages as the regression guard.

**Validation messages must be thunks.** `error: () => t('…')`, never `error: t('…')`. Schema
modules are evaluated at import, which ES module semantics put _before_ `i18next.init()` in
`app.ts`'s body; an eager `t()` returns `undefined` there and Zod silently discards it and uses
its own English. A thunk is called by Zod at parse time instead.
`tests/unit/i18n/validation-messages.test.ts` reproduces the live import ordering, which Jest's
`setupFiles` otherwise hides.

### Outside a request

The ambient `t` falls back to the global instance whenever there is no request on the async
chain — jobs, migrations, scripts, tests, and anything the queue picks up in another process.
Work that must speak a specific user's language has to carry the locale explicitly rather than
rely on the store surviving. Two mechanisms exist for that:

- **`users.locale`** — the language a user signed up in, editable afterwards. It is what a
  worker sending a password-reset email at 3am reads, because there is no request then to
  negotiate from. Every email addressed to a known user is sent in this language, falling back
  to the request's.
- **`enqueueEmail(request, template, data, locale?)`** — the locale travels in the queue payload
  and `workers/email.worker.ts` re-establishes it with `runWithLocale` before rendering. It
  defaults to the ambient locale, so ordinary call sites need no change.

One deliberate exception: the contact-form notification goes to the _support mailbox_, not to the
person who filled in the form, so it renders in `NODE_DEFAULT_LOCALE` — see
`controllers/feedback/post-feedback-contact.ts`.

### Serving the dictionary to a client

`GET /locales` reports what this deployment supports; `GET /locales/:locale` serves **this API's
own dictionary** — its response copy and nothing else. Both are public and cacheable: static
copy, no user data, and a client that has just failed to reach the API is exactly who needs them.

The rule they implement: **each repository owns its own dictionary.** This API never serves a
client's UI copy — that would put view text in the API's keyspace and make the two repositories
undeployable apart. A client merges what it fetches here under a namespace it reserves for the
API (`api.*` in the Vue boilerplate), never at the root, where two independently-authored
keyspaces would eventually collide silently.

A client normally needs none of it: this API resolves its own keys and puts finished text on the
wire. It earns its place when no response arrives at all — a network failure, a bare 502 — and the
client has to produce the copy itself, in the active language.

`src/locales/es.json` is the demonstration: Spanish was added by dropping in one file. The API
answers `Accept-Language: es` with no other change, and a client with no Spanish UI copy of its
own still shows Spanish API messages while its own strings fall back per key.

### What is deliberately NOT translated

These are technician-facing and stay English on purpose. Do not "fix" them:

- **log messages** (`logger.info`, `logger.error`, access logs)
- **audit-log actions** (`AuditAction.*`) and analytics event names
- **OpenTelemetry span names and attributes**
- **thrown `Error` messages**
- **the `message` argument of `rejectResponse`** — the third one. `rejectResponse(response,
status, message, errors)` splits the audiences: `message` is developer-oriented, `errors[]` is
  what the user reads. So `'updateOrder - missing id'` in `message` is correct, not debt.
- **`errors[].code`** — a stable machine-readable identifier clients switch on.

`tests/unit/i18n/no-hardcoded-user-text.test.ts` enforces the other side of that line: no string
literal may appear as a bare element of an `errors[]` array or as an error object's `message`.

## Observability (metrics + traces)

You now get:

- **Trace headers** on every response:
    - `x-trace-id`
    - `traceparent` (W3C format)
- **Metrics endpoint**:
    - `GET /observability/metrics` (Prometheus text format)

### Quick visual

```text
Client
  -> API request (optional traceparent)
  -> Express middleware
       -> requestId + trace context
       -> route handler
       -> metrics collector
  <- response with x-request-id + x-trace-id + traceparent

Prometheus
  -> GET /observability/metrics
  <- http_requests_total, http_request_duration_milliseconds, process_* metrics
```

### Quick examples

```bash
# 1) Check health and inspect trace headers
curl -i http://localhost:3000/

# 2) Continue an existing trace from another service
curl -i \
  -H "traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-1111111111111111-01" \
  http://localhost:3000/products

# 3) Scrape metrics
curl http://localhost:3000/observability/metrics
```

## Realtime examples

Realtime here is **server → client only**, over Server-Sent Events. There is deliberately no
WebSocket layer: SSE runs over plain HTTP, needs no upgrade handling, and survives clustering
without a backplane. If you need client → server messaging over a persistent connection, add
`ws` and an `'upgrade'` listener on the HTTP server returned by `startServer` (`src/app.ts`).

### SSE live metrics (`/observability/events`)

- Endpoint: `GET /observability/events`
- Event names:
    - `observability.metrics.snapshot` (first payload)
    - `observability.metrics.updated` (periodic updates)
    - `observability.heartbeat`

Quick check:

```bash
curl -N http://localhost:3000/observability/events
```

## AsyncAPI (async/event contracts)

- Async contract source of truth: `asyncapi.yaml`
- OpenAPI + AsyncAPI split in this repo:
    - `openapi.yaml` documents REST endpoints and request/response contracts
    - `asyncapi.yaml` documents event-driven contracts (SSE + ecommerce cart checkout + worker queues + cache pub/sub)

### Validate / view AsyncAPI

- Validate spec:
    - `npm run lint:asyncapi`
- Open AsyncAPI Studio locally:
    - `npm run docs:asyncapi`

## Scripts

There are ~50 of them. [docs/tools/package-scripts.md](docs/tools/package-scripts.md) is the full
map, grouped by job. The ones worth memorising:

| Script                     | Job                                                              |
| -------------------------- | ---------------------------------------------------------------- |
| `npm run compose:restart`  | bring the whole stack up — the normal way to start               |
| `npm run host -- <script>` | run any script on the host against the containerised Mongo/Redis |
| `npm run contracts:bundle` | rebuild the committed contracts from their per-module fragments  |
| `npm run gen:api`          | regenerate `api/` (types + Zod) from `openapi.yaml`              |
| `npm run gen:asyncapi`     | regenerate `src/types/asyncapi.ts` from `asyncapi.yaml`          |
| `npm run test`             | unit + cross-cutting + integration + contract                    |
| `npm run complete:check`   | build + test + lint + format check — what pre-commit runs, ~60s  |
| `npm run complete`         | the same, but fixing lint and formatting instead of reporting    |
| `npm run db:migrate:up`    | apply pending migrations (`:down` and `:status` alongside)       |
| `npm run db:seed:reset`    | drop and reseed the demo dataset                                 |

Migrations use [migrate-mongo](https://github.com/seppevs/migrate-mongo) with CommonJS `.js` files in `db/migrations/`.

## Port variables (quick map)

```text
NODE_PORT          -> Express app listening port
NODE_MONGODB_PORT  -> Mongo fallback port when NODE_DB_URI is not set
NODE_REDIS_PORT    -> Redis fallback port when NODE_REDIS_URL is not set
```

## CI pipeline (quick visual)

```text
npm ci
  -> ts-check
  -> lint
  -> test:unit
  -> test:integration
  -> lint:openapi
```

## OpenAPI workflow

`openapi.yaml` is the contract, but it is **assembled**, not hand-edited: each module owns its slice
in `src/modules/<name>/openapi/{paths,schemas}.yaml`, and seven documents in total are bundled from
fragments the same way.

```bash
# edit src/modules/<name>/openapi/paths.yaml — never openapi.yaml itself
npm run contracts:bundle    # fragments -> openapi.yaml (+ the other six bundles)
npm run gen:api              # openapi.yaml -> api/models + api/schemas.zod.ts
npm run lint:openapi        # spectral, against spectral.yaml
```

A fragment edited without re-bundling fails the test suite rather than drifting silently.

- **What to rerun after which edit**: [docs/api/regenerating.md](docs/api/regenerating.md)
- **Who owns which fragment, and why the bundler never parses YAML**: [docs/api/contract-fragmentation.md](docs/api/contract-fragmentation.md)

Everything in `api/` is a derived artifact — committed, but never hand-edited.

## AsyncAPI workflow

- Source of truth for async/realtime contracts: `asyncapi.yaml`
- Generated TypeScript types live in `src/types/asyncapi.ts` and are re-exported from `src/types/`
- Regenerate types after editing `asyncapi.yaml`:
    - `npm run gen:asyncapi`
- This contract documents:
    - SSE observability channels (`observability.*`)
    - RabbitMQ worker job queues (`worker.*`)
- All SSE/domain-event/queue code imports types and channel-name constants from `src/types`

## Frontend/backend tandem sync discipline

- Treat `openapi.yaml` as the canonical contract for both paired boilerplates.
- After any contract edit, regenerate derived artifacts (`npm run gen:api`) and commit the generated `api/` changes.
- Keep paired branches aligned (backend `api-mongodb-mongoose` with the intended frontend branch) before merging contract changes.
- Local pairing reminder:
    - Backend default URL: `http://localhost:3000`
    - Frontend dev URL: `http://localhost:8080`
    - Backend CORS should allow frontend origin `http://localhost:8080` (set `NODE_CORS_ORIGIN=http://localhost:8080`).

## Mock/testing helpers

Three ready-made collections sit at the repo root, next to the contract they are rendered from —
**do not import `openapi.yaml` yourself.** They are
generated from the contract by `npm run contracts:collections`, they carry one request per operation
plus the hand-authored negative probes, and their values come from `db/seeds/seed-identities.ts`, so
`POST /account/login` already sends credentials that work and `GET /products/{id}` asks for a product
the seeded database actually holds.

| File                     | Tool                          | Use it to                                              |
| ------------------------ | ----------------------------- | ------------------------------------------------------ |
| `contract.bruno.yml`     | [Bruno](https://usebruno.com) | act as a frontend client against the real API          |
| `contract.insomnia.json` | Insomnia                      | the same, in Insomnia                                  |
| `contract.mockoon.json`  | Mockoon                       | serve a fake API from the contract's declared examples |

1. Load the file for your tool (Bruno: `+` → _Import collection_; Mockoon: open it as an existing
   environment rather than importing OpenAPI).
2. Point `baseUrl` at `http://localhost:3000` for the real API, or at your Mockoon port for the mock.
3. Send requests.

Because they are generated, **never edit them by hand** — a fix belongs in the contract fragment, or
in that module's `dev/probes.yml` for requests a spec cannot describe (401s, 409s, rate limits). A
test asserts all three carry one request per declared operation, which is exactly the check that was
missing while the hand-written versions rotted — see
[docs/api/contract-fragmentation.md](docs/api/contract-fragmentation.md).

## How to expose services to local Wi-Fi (Podman)

### 1. Bind containers to LAN

Make sure ports are published to all interfaces:

```bash
podman run -p <host_port>:<container_port> IMAGE
```

Example:

```bash
podman run -p 3000:3000 my-app
```

Check running mappings:

```bash
podman ps
```

You should see:

```
0.0.0.0:3000->3000/tcp
```

---

### 2. Find your local IP

**Linux (Manjaro):**

```bash
hostname -I
```

**Windows:**

```cmd
ipconfig
```

Look for something like:

```
192.168.x.x
```

---

### 3. Access from other devices

Use:

```
http://<YOUR_LAN_IP>:<PORT>
```

Example:

```
http://192.168.1.50:3000
```

---

### 4. Firewall (if needed)

**Linux (ufw):**

```bash
sudo ufw allow <port>/tcp
```

**Windows:**

- Windows Defender Firewall → Advanced settings
- Inbound Rules → New Rule → Port → TCP → allow `<port>`

---

### 5. Notes

- No router port forwarding needed (LAN only)
- Use `127.0.0.1` for local-only access
- Use `0.0.0.0` binding via Podman port mapping (default behavior when using `-p`)

# TODO

- Complete .dev enviroment (Bruno, Mockoon, Insomnia (update))
- Create a mysql sequelize version
- Create a FASTIFY version
- Create a NESTJS version
- Add\Try graphql with graphql-yoga
