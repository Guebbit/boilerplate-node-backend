# Boilerplate Node Backend

TypeScript Node.js backend with Express, JWT auth, Mongoose, and OpenAPI-first tooling.

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
    - Remove `controllers/_development` and `routes/_development` before production deployments if you do not want development-only endpoints in your build.

## Quickstart

1. Install dependencies:
    - `npm install`
2. Create env file:
    - `cp .env-example .env`
3. Set required environment variables in `.env`:
    - `NODE_ACCESS_TOKEN_SECRET`
    - `NODE_REFRESH_TOKEN_SECRET`
    - Database config:
        - Preferred: `NODE_DB_URI`
        - Or fallback: `NODE_MONGODB_HOST` + `NODE_MONGODB_PORT` (+ optional `NODE_MONGODB_NAME`)
4. Optional: enable Redis response caching by setting:
    - Preferred: `NODE_REDIS_URL`
    - Or fallback: `NODE_REDIS_HOST` + `NODE_REDIS_PORT`
    - `NODE_REDIS_CACHE_ENABLED=1`
5. Start development server:
    - `npm run dev`

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
    - `GET /metrics` (Prometheus text format)

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
  -> GET /metrics
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
curl http://localhost:3000/metrics
```

## Scripts

- `npm run dev` - run API in watch mode
- `npm run dev:docker` - docker/podman single-worker hot-reload mode
- `npm run dev:docker:cluster` - docker/podman clustered dev mode
- `npm run ts-check` - TypeScript type-check
- `npm run lint` - lint checks
- `npm run test` - unit + integration tests
- `npm run test:unit` - unit tests
- `npm run test:integration` - HTTP integration tests
- `npm run build` - type-check + lint
- `npm run db:migrate` - apply pending migrations (TypeScript runtime)
- `npm run db:migrate:down` - rollback last migration
- `npm run db:migrate:status` - list migration status
- `npm run complete` - build + test + auto-fix lint/prettier
- `npm run complete:check` - build + test + non-mutating lint/prettier checks

Migrations run through a TypeScript-compatible runtime (`tsx`) so `db/migrations/*.ts` can import migration-safe helpers from `src/migrations/`.

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

# TODO

- Complete .dev enviroment (Bruno, Mockoon, Insomnia (update))
- Create a mysql sequelize version
- Create a FASTIFY version
- Create a NESTJS version
- Add\Try graphql with graphql-yoga
