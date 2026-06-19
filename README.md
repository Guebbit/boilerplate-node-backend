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
    - Remove `controllers/_development` and `routes/_development` before production deployments if you do not want development-only endpoints in your build.

## Quickstart

1. Install dependencies:
    - `npm install`
2. Create env file:
    - `cp .env-example .env`
3. Set required environment variables in `.env`:
    - `NODE_TOKEN_ACCESS`
    - `NODE_TOKEN_REFRESH`
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

### WebSocket chat (`/ws/chat`)

- Connect to `ws://localhost:3000/ws/chat`
- Join default room:
    - `{"type":"chat:join","payload":{"username":"alice"}}`
- Send a message:
    - `{"type":"chat:message:send","payload":{"message":"hello"}}`

Contracts are defined as AsyncAPI channels in `asyncapi.yaml` and generated into `src/types/asyncapi.ts`.

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
    - `asyncapi.yaml` documents event-driven contracts (WebSocket + SSE + ecommerce cart checkout)

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
- `npm run gen:asyncapi-types` - generate TypeScript types from asyncapi.yaml into `src/types/`
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
    - `npm run gen:asyncapi-types`
- This contract documents:
    - WebSocket chat channels (`realtime.chat.*`)
    - SSE observability channels (`observability.*`)
    - Ecommerce cart checkout events (`ecommerce.cart.checked_out`)
- All WebSocket/SSE/domain-event code imports types and channel-name constants from `src/types`

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

* Windows Defender Firewall → Advanced settings
* Inbound Rules → New Rule → Port → TCP → allow `<port>`

---

### 5. Notes

* No router port forwarding needed (LAN only)
* Use `127.0.0.1` for local-only access
* Use `0.0.0.0` binding via Podman port mapping (default behavior when using `-p`)


# TODO

- Complete .dev enviroment (Bruno, Mockoon, Insomnia (update))
- Create a mysql sequelize version
- Create a FASTIFY version
- Create a NESTJS version
- Add\Try graphql with graphql-yoga
