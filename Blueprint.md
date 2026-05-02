# Blueprint — Node API Boilerplate (MongoDB/Mongoose)

> Tracks architectural decisions, phase-by-phase additions, and design rationale.
> Updated at each implementation phase.

---

## Architecture overview

```text
┌──────────────────────────────────────────────────┐
│                  HTTP Client                      │
└──────────────────────────┬───────────────────────┘
                           │ HTTP
                           ▼
┌──────────────────────────────────────────────────┐
│               Express App (app.ts)                │
│                                                   │
│  Middleware chain (in order):                     │
│    helmet → cors → urlencoded → json →            │
│    cookieParser → rateLimiter →                   │
│    request-id → trace-context →                   │
│    requestLogger ←── Phase 1                      │
│    request-metrics ←── Phase 2                    │
│                                                   │
│  Routes:                                          │
│    /account  /products  /orders  /cart  /users  / │
└───────────┬──────────────────────────┬────────────┘
            │                          │
            ▼                          ▼
    ┌───────────────┐         ┌──────────────────┐
    │  Controllers  │         │  System / Health  │
    └───────┬───────┘         │  /metrics  /health│
            │                 └──────────────────┘
            ▼
    ┌───────────────┐
    │   Services    │  ← Business logic, validation
    └───────┬───────┘
            │
            ▼
    ┌───────────────┐
    │ Repositories  │  ← MongoDB / Mongoose queries
    └───────┬───────┘
            │
            ▼
    ┌───────────────┐
    │    MongoDB    │
    └───────────────┘
```

---

## Layer responsibilities

| Layer | File location | Responsibility |
|---|---|---|
| Routes | `src/routes/` | HTTP method + path → middleware stack |
| Controllers | `src/controllers/` | Parse input, call service, format response |
| Services | `src/services/` | Business logic, validation, authorization scope |
| Repositories | `src/repositories/` | MongoDB CRUD/aggregation, no business rules |
| Models | `src/models/` | Mongoose schemas, TypeScript types, indexes |
| Middlewares | `src/middlewares/` | Auth guards, security, request logging |
| Utils | `src/utils/` | Shared cross-cutting helpers |

---

## Cross-cutting concerns

| Concern | Implementation | Location |
|---|---|---|
| Request correlation ID | `x-request-id` header propagation | `app.ts` |
| Distributed tracing | W3C `traceparent` header | `src/utils/observability.ts` |
| Prometheus metrics | prom-client counter + histogram + gauge | `src/utils/observability.ts`, `src/utils/domain-metrics.ts` ← Phase 2 |
| Structured logging | Winston JSON logger | `src/utils/winston.ts` ← Phase 1 |
| Audit logging | Dedicated `auditLogger` | `src/utils/winston.ts` ← Phase 1 |
| Request access log | `requestLogger` middleware | `src/middlewares/request-logger.ts` ← Phase 1 |
| Sensitive redaction | `redactSensitiveFields()` | `src/utils/winston.ts` ← Phase 1 |
| Error handling | Global Express error handler | `app.ts` |
| Auth (JWT) | Access token + refresh token | `src/middlewares/auth-jwt.ts` |
| Rate limiting | `express-rate-limit` | `src/middlewares/security.ts` |
| Secure headers | `helmet` | `app.ts` |
| i18n | `i18next` | `src/locales/` |

---

## Observability phases

### ✅ Phase 0 — Baseline inventory (pre-existing)

What was already in place before the observability plan:

- Winston logger (`src/utils/winston.ts`) — basic JSON format
- Request correlation ID middleware in `app.ts`
- W3C traceparent / trace context middleware in `app.ts`
- Prometheus-style metrics endpoint (`GET /metrics`) via `src/utils/observability.ts`
- Global error handler logging errors with `logger.error`

### ✅ Phase 1 — Structured logging foundation

**Goal:** make all application and request logs production-grade, consistent, and safe.

**What was added:**

#### 1. Enhanced Winston logger (`src/utils/winston.ts`)

- `timestamp` field in every log entry (ISO 8601 with timezone)
- `service` tag from `NODE_SERVICE_NAME` env var (default `api`)
- `NODE_LOG_LEVEL` env var support for runtime log-level control
- Non-production pretty-print console format (colourised, human-readable)
- Production JSON format on console
- `error.log` file for error-level entries

#### 2. Sensitive field redaction

- `redactSensitiveFields()` — recursive walk that replaces sensitive values with `[REDACTED]`
- Applied automatically to every log entry via a Winston format plugin
- Fields redacted: `password`, `token`, `authorization`, `cookie`, `jwt`, `secret`, `api_key`, and more
- Case-insensitive matching

#### 3. Error serialization

- `serializeError()` — converts `Error` instances to plain objects `{ name, message, stack }`
- Stack omitted in production to prevent internal path leakage

#### 4. Structured request access log (`src/middlewares/request-logger.ts`)

- New `requestLogger` middleware replaces the previous basic request logger
- Fires on `response.finish` (after response is sent) so `status_code` and `duration_ms` are always present
- Log level derived from status code: `info` (2xx), `warn` (4xx), `error` (5xx)
- Fields: `timestamp`, `level`, `message`, `request_id`, `trace_id`, `span_id`, `method`, `route`, `status_code`, `duration_ms`, `user_id`, `ip`, `headers`
- `user_id` present only when request is authenticated
- Authorization / Cookie headers stripped from logged headers

#### 5. Dedicated audit logger

- `auditLogger` instance in `src/utils/winston.ts`
- Always writes to `audit.log` file
- Tagged with `log_type: "audit"` for easy log aggregator filtering
- Same redaction pipeline as main logger
- Used for process-level security events (`unhandledRejection`, `uncaughtException`)
- Ready for service-layer audit events (auth, admin actions)

#### 6. Environment variables added

| Variable | Purpose |
|---|---|
| `NODE_LOG_LEVEL` | Override Winston log level |
| `NODE_SERVICE_NAME` | Service tag in every log entry |

#### 7. Documentation added

- `docs/guide/structured-logging.md` — log format, redaction, examples, code map
- `docs/guide/audit-logging.md` — audit event taxonomy, required fields, examples

**Tests added:**
- `tests/unit/utils/winston.test.ts` — 12 tests for `redactSensitiveFields` and `serializeError`
- `tests/unit/middlewares/request-logger.test.ts` — 9 tests for the request logger middleware

---

### ✅ Phase 2 — Prometheus metrics

**Library:** `prom-client` (v15) — the standard Prometheus client for Node.js.

**HTTP metrics** (auto-collected by inline middleware in `src/app.ts`):
- `http_requests_total{method,route,status_code}` — request counter
- `http_request_duration_milliseconds` — latency histogram (buckets: 5–5000 ms)
- `http_errors_total{method,route,status_code}` — 4xx/5xx error counter
- `http_in_flight_requests` — gauge for concurrent active requests

**Domain counters** (`src/utils/domain-metrics.ts`, incremented in controllers):
- `auth_login_success_total` / `auth_login_failure_total`
- `auth_signup_total`
- `cart_checkout_success_total` / `cart_checkout_failure_total`
- `order_created_total`

**MongoDB query metrics** (global Mongoose plugin in `src/utils/database.ts`):
- `mongodb_query_duration_milliseconds{collection,operation}` — histogram
- `mongodb_queries_total{collection,operation}` — counter
- `mongodb_query_errors_total{collection,operation}` — error counter

**Process / runtime metrics** (via `collectDefaultMetrics()`):
- `process_uptime_seconds`, `process_resident_memory_bytes`, `nodejs_eventloop_lag_seconds`, GC, CPU, handles
- `process_runtime_errors_total` — uncaught exception counter

**Endpoint:** `GET /metrics` — returns Prometheus text format.

**Files changed:**
- `src/utils/observability.ts` — replaced custom Map-based implementation with prom-client
- `src/utils/domain-metrics.ts` — new file: domain and MongoDB metric definitions
- `src/utils/database.ts` — added global Mongoose query timing plugin
- `src/app.ts` — updated middleware to track in-flight requests and runtime errors
- `src/routes/index.ts` — `/metrics` handler made async for prom-client
- `src/controllers/account/post-login.ts` — login success/failure counters
- `src/controllers/account/post-signup.ts` — signup counter
- `src/controllers/cart/post-checkout.ts` — checkout success/failure counters
- `src/controllers/orders/post-orders.ts` — order creation counter

**Docs:** `docs/guide/metrics.md` — ADHD-friendly reference with visual diagram, PromQL examples, and FAQ.

**Tests added:**
- `tests/unit/utils/observability.test.ts` — 20 tests for metrics recording and trace context
- `tests/unit/utils/domain-metrics.test.ts` — 8 tests for domain counters
- `tests/integration/app-health.test.ts` — updated with Phase 2 assertions

---

### 🔜 Phase 3 — OpenTelemetry instrumentation (planned)

- W3C traceparent already propagated; add OTel SDK spans
- Instrument HTTP layer, service methods, repository calls
- Export to Tempo or Jaeger

### 🔜 Phase 4 — Loki centralized logs (planned)

- Ship Winston output to Loki
- Use `service`, `log_type`, `level` as stream labels
- Correlate with trace IDs from Phase 3

### 🔜 Phase 5 — Tempo + Grafana dashboards (planned)

- Connect traces to Tempo
- Build Grafana dashboards: API, Auth, Ecommerce, DB, Ops

### 🔜 Phase 6 — Audit analytics (planned)

- Persist audit events to MongoDB for querying and reporting
- Formalize audit event schema

### 🔜 Phase 7 — PostHog product analytics (planned)

- Track funnel events: signup, product search, cart, checkout, order
- Business-level analytics separate from operational observability

---

## Environment variable matrix

### Required

| Variable | Description |
|---|---|
| `NODE_DB_URI` | MongoDB connection string |
| `NODE_ACCESS_TOKEN_SECRET` | JWT access token signing secret |
| `NODE_REFRESH_TOKEN_SECRET` | JWT refresh token signing secret |

### Runtime

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | — | `production` / `development` / `test` |
| `NODE_PORT` | `3000` | HTTP port |
| `NODE_URL` | — | Public base URL |
| `NODE_ENABLE_CLUSTERING` | `1` | Enable multi-worker cluster mode |
| `NODE_CLUSTER_WORKERS` | `0` (auto) | Explicit worker count |
| `NODE_DEFAULT_LOCALE` | `en` | Default i18n locale |
| `NODE_FALLBACK_LOCALE` | `en` | Fallback i18n locale |
| `NODE_TOKEN_CLEANUP_INTERVAL` | `3600000` | Token sweep interval (ms) |
| `NODE_GRACEFUL_SHUTDOWN_TIMEOUT_MS` | `15000` | Max shutdown time (ms) |
| `NODE_CORS_ORIGIN` | `http://localhost:5173` | Comma-separated allowed origins |

### Phase 1 — Structured logging

| Variable | Default | Description |
|---|---|---|
| `NODE_LOG_LEVEL` | `info` (prod) / `debug` (dev) | Winston log level |
| `NODE_SERVICE_NAME` | `api` | Service tag in log entries |

### Phase 2 — Prometheus metrics

No new environment variables required. The `/metrics` endpoint is always available at startup.

### JWT expiry

| Variable | Description |
|---|---|
| `NODE_ACCESS_TOKEN_SECRET_TIME` | Access token lifetime (seconds) |
| `NODE_REFRESH_TOKEN_SECRET_TIME_SHORT` | Short refresh token (7 days) |
| `NODE_REFRESH_TOKEN_SECRET_TIME_MEDIUM` | Medium refresh token (30 days) |
| `NODE_REFRESH_TOKEN_SECRET_TIME_LONG` | Long refresh token (1 year) |

### SMTP

| Variable | Description |
|---|---|
| `NODE_SMTP_HOST` | SMTP server hostname |
| `NODE_SMTP_PORT` | SMTP port |
| `NODE_SMTP_USER` | SMTP username |
| `NODE_SMTP_PASS` | SMTP password |
| `NODE_SMTP_SENDER` | From address |

### Upload

| Variable | Description |
|---|---|
| `NODE_PUBLIC_PATH` | Public static files directory |

### Optional PDF

| Variable | Description |
|---|---|
| `PUPPETEER_EXECUTABLE_PATH` | Chromium path for PDF generation |

---

## Domain modules

| Module | Routes | Notes |
|---|---|---|
| Account / Auth | `/account` | Login, signup, refresh, password reset, logout-all |
| Users | `/users` | Admin-only CRUD |
| Products | `/products` | Public read, admin write, soft delete |
| Cart | `/cart` | Per-user cart with computed totals, checkout |
| Orders | `/orders` | Owner/admin access, invoice PDF |
| System | `/` | Health check, metrics |
