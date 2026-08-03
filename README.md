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
- IMPORTANT:
    - Development-only endpoints (e.g. `GET /observability/load-test`) are gated behind `NODE_ENV !== 'production'` and are not registered in production builds.

## Quickstart

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
4. Pick your container runtime's Promtail override (see `.env-example` → _Promtail Log
   Collection_), e.g. `COMPOSE_FILE=docker-compose.yml:docker-compose.podman.yml`.
5. Bring the stack up:
    - `podman compose up` (or `docker compose up`)

That is the whole quickstart. The `app` container runs `npm run db:bootstrap` before starting
the server, so the database is migrated and seeded on first boot and you get a browsable API
with demo products, users and orders rather than empty lists. Both halves are idempotent, so
later boots are a no-op — see [Database migrations & seeding](#database-migrations--seeding).

### Running on the host

`npm run dev` on its own will **not** work against the shipped `.env`: the hostname `database`
only resolves inside the compose network. Use the `:host` script variants, which override the
URIs to `localhost` (the compose files publish Mongo on `27017` and Redis on `6379`, so start
the stack — or at least those two services — first):

| Container-first (default)   | Host equivalent                  |
| --------------------------- | -------------------------------- |
| `npm run dev:docker`        | `npm run dev:host`               |
| `npm run db:migrate:up`     | `npm run db:migrate:up:host`     |
| `npm run db:migrate:down`   | `npm run db:migrate:down:host`   |
| `npm run db:migrate:status` | `npm run db:migrate:status:host` |
| `npm run db:seed`           | `npm run db:seed:host`           |
| `npm run db:seed:reset`     | `npm run db:seed:reset:host`     |
| `npm run db:cache:clear`    | `npm run db:cache:clear:host`    |
| `npm run db:bootstrap`      | `npm run db:bootstrap:host`      |

The `:host` scripts set `NODE_DB_URI` and `NODE_REDIS_URL` inline via `cross-env`; they do not
read a second env file, so there is nothing to keep in sync.

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

## Database migrations & seeding

Two tools, two non-overlapping jobs:

|                     | Owns                                                    | Command                 | Re-runnable?                           |
| ------------------- | ------------------------------------------------------- | ----------------------- | -------------------------------------- |
| `migrate-mongo`     | **schema** — indexes, collection options, field renames | `npm run db:migrate:up` | yes, tracked in `migrations_changelog` |
| `db/seeds/index.ts` | **demo data** — users, products, orders                 | `npm run db:seed`       | yes, upserts by fixed `_id`            |

`npm run db:bootstrap` runs both, in that order, and is what the compose `app` service executes
before starting the server.

- The seeder **refuses to run when `NODE_ENV=production`**.
- Passwords in the seed file are plain text; the model's `pre('save')` hook hashes them. Never
  paste a pre-computed hash there — it drifts from the hook and its plaintext gets lost.
- Seed credentials: `root@root.it` / `rootroot` (admin) and `gino@pino.it` / `password`.
- `npm run db:seed:reset` drops the database first, for when you want a clean slate.

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

- `npm run dev` - run API in watch mode
- `npm run dev:docker` - docker/podman single-worker hot-reload mode
- `npm run dev:docker:cluster` - docker/podman clustered dev mode
- `npm run ts-check` - TypeScript type-check
- `npm run lint` - lint checks
- `npm run lint:asyncapi` - validate AsyncAPI contract
- `npm run genasyncapi` - generate TypeScript types from asyncapi.yaml into `src/types/`
- `npm run prettier:check` - prettier non-mutating formatting check
- `npm run test` - unit + integration tests
- `npm run test:unit` - unit tests
- `npm run test:integration` - HTTP integration tests
- `npm run build` - type-check + lint
- `npm run db:migrate` - apply pending migrations
- `npm run db:migrate:down` - rollback last migration
- `npm run db:migrate:status` - list migration status
- `npm run complete` - build + test + auto-fix lint/prettier
- `npm run complete:check` - build + test + non-mutating lint/prettier checks

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

- Source of truth: `openapi.yaml`
- Lint OpenAPI spec:
    - `npm run lint:openapi`
- Generate typed API client:
    - `npm run genapi`

Use the generated `api/` output as derived artifacts from `openapi.yaml`.

## AsyncAPI workflow

- Source of truth for async/realtime contracts: `asyncapi.yaml`
- Generated TypeScript types live in `src/types/asyncapi.ts` and are re-exported from `src/types/`
- Regenerate types after editing `asyncapi.yaml`:
    - `npm run genasyncapi`
- This contract documents:
    - SSE observability channels (`observability.*`)
    - Ecommerce cart checkout events (`ecommerce.cart.checked_out`)
    - RabbitMQ worker job queues (`worker.*`)
    - Redis pub/sub cache invalidation (`cache.tags.invalidated`)
- All SSE/domain-event/queue code imports types and channel-name constants from `src/types`

## Frontend/backend tandem sync discipline

- Treat `openapi.yaml` as the canonical contract for both paired boilerplates.
- After any contract edit, regenerate derived artifacts (`npm run genapi`) and commit the generated `api/` changes.
- Keep paired branches aligned (backend `api-mongodb-mongoose` with the intended frontend branch) before merging contract changes.
- Local pairing reminder:
    - Backend default URL: `http://localhost:3000`
    - Frontend dev URL: `http://localhost:8080`
    - Backend CORS should allow frontend origin `http://localhost:8080` (set `NODE_CORS_ORIGIN=http://localhost:8080`).

## Mock/testing helpers

The `.dev/` folder contains Bruno/Mockoon/Insomnia assets for local API exploration and API mocking.

### Bruno (mock frontend consuming your API)

Use `openapi.yaml` with Bruno to quickly create and test requests as if you were a frontend client.

1. Open Bruno.
2. In the left sidebar, click `+` -> `Import collection`.
3. Import from `openapi.yaml`.
4. Create/select a Bruno environment (for example `local`).
5. Set environment variable `baseUrl` to:
    - `http://localhost:3001` (Mockoon default)
6. In the top-right environment selector, switch from `No environment` to your `local` environment.
7. Send requests to verify payload shapes, status codes, and auth flow.

Tip: keep one environment pointing to the real backend (`http://localhost:3000`) and one to Mockoon (`http://localhost:3001`) so you can switch quickly.

### Mockoon (mock API returning fake data)

Use `openapi.yaml` with Mockoon to generate a fake backend that returns mock responses.

1. Open Mockoon desktop app.
2. In the top menu, select:
    - `Import/Export` -> `Import OpenAPI/Swagger` (Swagger v2/OpenAPI import)
3. Select `openapi.yaml`.
4. Review generated routes and sample responses.
5. Set Mockoon port to `3001` (or adjust Bruno `baseUrl` accordingly).
6. Start the mock server.
7. Call endpoints from Bruno/Postman/frontend to test client integration without using the real database.

Tip: enrich generated routes with realistic status codes (`200`, `400`, `401`, `404`, `500`) to test client error handling.

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
