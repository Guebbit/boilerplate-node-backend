# Blueprint — Node API Boilerplate (MongoDB/Mongoose)

> Tracks architectural decisions, phase-by-phase additions, and design rationale.
> Updated at each implementation phase.

---

## Architecture overview

```text
┌──────────────────────────────────────────────────┐
│                  HTTP Client                      │
└──────────────────────────┬───────────────────────┘
                           │ HTTP  (W3C traceparent)
                           ▼
┌──────────────────────────────────────────────────┐
│               Express App (app.ts)                │
│                                                   │
│  Middleware chain (in order):                     │
│    tracing (OTel SDK init) ←── Phase 3            │
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
    │ Repositories  │  ← MongoDB / Mongoose queries + OTel DB spans
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
| Distributed tracing | W3C `traceparent` + OTel SDK spans | `src/utils/tracing.ts` ← Phase 3 |
| OTel tracer helper | `getTracer()`, `withSpan()`, `recordErrorOnActiveSpan()` | `src/utils/tracer.ts` ← Phase 3 |
| Prometheus metrics | prom-client counters, histograms, gauges | `src/utils/observability.ts` ← Phase 2 |
| Domain / business metrics | auth, cart, order counters | `src/utils/domain-metrics.ts` ← Phase 2 |
| DB query metrics + spans | Mongoose plugin (duration, count, errors, OTel spans) | `src/utils/domain-metrics.ts` ← Phase 2/3 |
| Email span | `nodemailer()` wrapped in OTel span | `src/utils/nodemailer.ts` ← Phase 3 |
| Structured logging | Winston JSON logger | `src/utils/winston.ts` ← Phase 1 |
| Audit logging | Dedicated `auditLogger` | `src/utils/winston.ts` ← Phase 1 |
| Request access log | `requestLogger` middleware + OTel trace IDs | `src/middlewares/request-logger.ts` ← Phase 1/3 |
| Sensitive redaction | `redactSensitiveFields()` | `src/utils/winston.ts` ← Phase 1 |
| Error handling | Global Express error handler + span error recording | `app.ts` |
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

### ✅ Phase 2 — Prometheus metrics integration

**Goal:** expose real Prometheus metrics via `prom-client` covering HTTP, business domain, and DB layers.

**What was added:**

#### 1. prom-client HTTP metrics (`src/utils/observability.ts`)

- Replaced custom in-memory metric implementation with `prom-client` (v15.1.3)
- `metricsRegistry` — shared prom-client Registry exported for tests and the metrics route
- `collectDefaultMetrics()` — Node.js process metrics (CPU, memory, event loop, GC, heap)
- `process_uptime_seconds` — custom Gauge (not in prom-client defaults)
- `http_requests_total{method,route,status_code}` — request counter
- `http_request_duration_milliseconds{method,route}` — histogram (buckets: 5–5000 ms)
- `http_request_errors_total{method,route,status_code}` — 4xx/5xx error counter
- `http_requests_in_flight` — live gauge incremented/decremented per request
- `incrementInflight()` / `decrementInflight()` — helpers used by Express middleware
- `getPrometheusMetrics()` — now returns `Promise<string>` via `metricsRegistry.metrics()`

#### 2. Business domain metrics (`src/utils/domain-metrics.ts`)

New file with business counters and DB metrics:

| Metric | Labels | Where incremented |
|---|---|---|
| `auth_login_total` | `status` | `post-login.ts` |
| `auth_signup_total` | `status` | `post-signup.ts` |
| `auth_password_reset_total` | `status` | ready for instrumentation |
| `auth_refresh_total` | `status` | ready for instrumentation |
| `auth_token_cleanup_total` | — | ready for instrumentation |
| `cart_checkout_total` | `status` | `post-checkout.ts` |
| `order_created_total` | — | `post-orders.ts` |
| `db_query_total` | `collection`, `operation` | Mongoose plugin |
| `db_query_duration_seconds` | `collection`, `operation` | Mongoose plugin |
| `db_errors_total` | `collection`, `operation` | Mongoose plugin |

Also contains `mongooseMetricsPlugin` — a Mongoose schema plugin that wraps all query and save operations with pre/post hooks to record DB timing and errors.

#### 3. Mongoose plugin registration (`src/utils/database.ts`)

- `mongoose.plugin(mongooseMetricsPlugin)` called at module load, before any schema is defined
- Applies to every model automatically

#### 4. Updated `/metrics` route (`src/routes/index.ts`)

- Now async: `await getPrometheusMetrics()` with `metricsRegistry.contentType` header

#### 5. Updated Express middleware (`src/app.ts`)

- Request metrics middleware now calls `incrementInflight()` on start and `decrementInflight()` on finish

#### 6. Instrumented controllers

- `src/controllers/account/post-login.ts` → `authLoginTotal`
- `src/controllers/account/post-signup.ts` → `authSignupTotal`
- `src/controllers/cart/post-checkout.ts` → `cartCheckoutTotal`
- `src/controllers/orders/post-orders.ts` → `orderCreatedTotal`

#### 7. Tests added/updated

- `tests/integration/app-health.test.ts` — updated: now tests histogram buckets, in-flight gauge, error counter, Node.js default metrics
- `tests/unit/utils/observability.test.ts` — new: 16 tests for `normalizeRoutePath`, `createTraceContext`, `toTraceparentHeader`, `recordRequestMetric`, and `getPrometheusMetrics`

#### 8. Documentation added

- `docs/guide/prometheus-metrics.md` — full metric list, data flow diagram, PromQL examples, scrape config
- `docs/guide/observability.md` — updated to reference new metrics and Phase 2 doc
- `docs/index.md` — added Phase 2 feature card

---

### ✅ Phase 3 — OpenTelemetry instrumentation

**Goal:** add real distributed tracing to every layer of the stack and correlate trace IDs with Phase 1 logs and Phase 2 metrics.

**What was added:**

#### 1. OTel SDK setup (`src/utils/tracing.ts`)

- `startTracing()` — initialises `NodeSDK` with:
  - `ConsoleSpanExporter` (non-production stdout)
  - `OTLPTraceExporter` via `BatchSpanProcessor` (when `OTEL_EXPORTER_OTLP_ENDPOINT` is set)
  - `HttpInstrumentation` — auto-instruments incoming HTTP requests
  - `ExpressInstrumentation` — auto-instruments Express router
  - `resourceFromAttributes()` — sets `service.name` and `service.version` on every span
- `shutdownTracing()` — flushes pending spans; called during graceful server shutdown

#### 2. Tracer helper (`src/utils/tracer.ts`)

| Export | Purpose |
|---|---|
| `getTracer()` | Returns the active OTel tracer (scoped to this service) |
| `withSpan(name, callback, attrs?)` | Runs async callback inside a named span; records errors |
| `getActiveSpanContext()` | Returns `{ traceId, spanId }` from the active OTel span |
| `setActiveSpanAttributes(attrs)` | Attaches attributes to the active span |
| `recordErrorOnActiveSpan(error)` | Marks span as error and records exception event |

#### 3. Updated `src/app.ts`

- OTel `startTracing()` is the **first import** — ensures patching before Express loads
- Trace-context middleware: prefers OTel span IDs over manual W3C parsing
- Global error handler: calls `recordErrorOnActiveSpan(error)` so every unhandled error lands on the trace
- `stopServer()` calls `shutdownTracing()` to flush spans before process exit

#### 4. Updated `src/cluster.ts`

- Calls `startTracing()` before forking workers

#### 5. DB spans in Mongoose plugin (`src/utils/domain-metrics.ts`)

- Every query/save now opens an OTel child span alongside the existing Prometheus metric
- Span attributes: `db.system`, `db.operation`, `db.mongodb.collection`
- Error path records exception event on the span

#### 6. Email span (`src/utils/nodemailer.ts`)

- `nodemailer()` now wraps the full email-send flow in `withSpan('email.send')`
- Span attributes: `messaging.system`, `messaging.destination`, `email.template`

#### 7. Log/trace correlation (`src/middlewares/request-logger.ts`)

- `requestLogger` prefers OTel span IDs for `trace_id` and `span_id` in access logs
- Falls back to manual `traceContext` when no OTel span is active

#### 8. Environment variables added

| Variable | Default | Description |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | _(unset)_ | Tempo / Jaeger OTLP base URL |
| `OTEL_EXPORTER_OTLP_HEADERS` | _(unset)_ | Comma-separated `key=value` auth headers |

#### 9. Tests added

- `tests/unit/utils/tracing.test.ts` — 32 tests using `NodeTracerProvider` + `InMemorySpanExporter`

#### 10. Documentation added

- `docs/guide/opentelemetry-tracing.md` — full tracing guide with flow diagram, Tempo Docker Compose snippet, code examples, env var table
- `docs/index.md` — Phase 3 feature card added
- `docs/.vitepress/config.mts` — sidebar entry added

---

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

### Phase 3 — OpenTelemetry tracing

| Variable | Default | Description |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | _(unset)_ | Tempo / Jaeger OTLP base URL |
| `OTEL_EXPORTER_OTLP_HEADERS` | _(unset)_ | Comma-separated `key=value` auth headers |

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
