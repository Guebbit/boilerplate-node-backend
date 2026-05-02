# Prometheus Metrics (Phase 2)

> **TL;DR** — The API exposes a `/metrics` endpoint. Scrape it with Prometheus and visualise in Grafana.

---

## What is measured

### HTTP layer

| Metric                               | Type      | Labels                           | What it tells you        |
| ------------------------------------ | --------- | -------------------------------- | ------------------------ |
| `http_requests_total`                | Counter   | `method`, `route`, `status_code` | Traffic per endpoint     |
| `http_request_duration_milliseconds` | Histogram | `method`, `route`                | Latency (p50/p95/p99)    |
| `http_request_errors_total`          | Counter   | `method`, `route`, `status_code` | 4xx/5xx rate             |
| `http_requests_in_flight`            | Gauge     | —                                | Concurrent live requests |

### Business / domain

| Metric                      | Type    | Labels                      | What it tells you       |
| --------------------------- | ------- | --------------------------- | ----------------------- |
| `auth_login_total`          | Counter | `status` (success\|failure) | Login funnel health     |
| `auth_signup_total`         | Counter | `status`                    | Sign-up funnel health   |
| `auth_password_reset_total` | Counter | `status`                    | Password reset requests |
| `auth_refresh_total`        | Counter | `status`                    | Token refresh activity  |
| `auth_token_cleanup_total`  | Counter | —                           | Token cleanup job runs  |
| `cart_checkout_total`       | Counter | `status`                    | Checkout conversion     |
| `order_created_total`       | Counter | —                           | Order volume            |

### Database (Mongoose)

| Metric                      | Type      | Labels                    | What it tells you      |
| --------------------------- | --------- | ------------------------- | ---------------------- |
| `db_query_total`            | Counter   | `collection`, `operation` | Query volume per model |
| `db_query_duration_seconds` | Histogram | `collection`, `operation` | Query latency          |
| `db_errors_total`           | Counter   | `collection`, `operation` | Query error rate       |

### Process / runtime (built-in)

Collected automatically via `prom-client`'s `collectDefaultMetrics()`:

- `process_uptime_seconds`
- `process_resident_memory_bytes`
- `process_cpu_seconds_total`
- `nodejs_eventloop_lag_seconds` (and p50/p90/p99 variants)
- `nodejs_heap_size_used_bytes`
- `nodejs_gc_duration_seconds`
- … and more

---

## Data flow diagram

```text
HTTP Request
    │
    ▼
┌──────────────────────────────────────┐
│  Express metrics middleware (app.ts)  │
│  incrementInflight()                  │
│  ─── request completes ───►           │
│  decrementInflight()                  │
│  recordRequestMetric()                │
│    ├─ http_requests_total.inc()       │
│    ├─ http_request_duration.observe() │
│    └─ http_request_errors_total.inc() │
└──────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────┐
│  Business controllers                 │
│  post-login     → authLoginTotal      │
│  post-signup    → authSignupTotal     │
│  post-checkout  → cartCheckoutTotal   │
│  post-orders    → orderCreatedTotal   │
└──────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────┐
│  Mongoose plugin (all schemas)        │
│  pre(find/save/…)  → start timer     │
│  post(find/save/…) → databaseQueryDuration.observe()
│                      databaseQueryTotal.inc()
│  post(error)       → databaseErrorsTotal.inc()
└──────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────┐
│  prom-client registry                 │
│  metricsRegistry.metrics()            │
└────────────────┬─────────────────────┘
                 │
                 ▼
         GET /metrics  ◄─── Prometheus scrape
```

---

## Quick start

```bash
# Fetch metrics
curl http://localhost:3000/metrics
```

Sample output:

```text
# HELP http_requests_total Total number of HTTP requests handled.
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/",status_code="200"} 42

# HELP http_request_duration_milliseconds HTTP request duration in milliseconds.
# TYPE http_request_duration_milliseconds histogram
http_request_duration_milliseconds_bucket{method="GET",route="/",le="5"} 2
http_request_duration_milliseconds_bucket{method="GET",route="/",le="10"} 8
...

# HELP auth_login_total Total login attempts, labelled by outcome.
# TYPE auth_login_total counter
auth_login_total{status="success"} 7
auth_login_total{status="failure"} 2

# HELP process_uptime_seconds Uptime of the Node.js process in seconds.
# TYPE process_uptime_seconds gauge
process_uptime_seconds 1234.56
```

---

## File map

```text
src/utils/observability.ts
  ├─ metricsRegistry       — shared prom-client Registry
  ├─ collectDefaultMetrics — Node.js built-in metrics
  ├─ httpRequestsTotal     — HTTP request counter
  ├─ httpRequestDuration   — HTTP duration histogram
  ├─ httpRequestErrorsTotal — 4xx/5xx counter
  ├─ httpInflightRequests  — in-flight gauge
  ├─ recordRequestMetric() — called by Express middleware
  ├─ incrementInflight()   — called on request start
  ├─ decrementInflight()   — called on request end
  └─ getPrometheusMetrics() → metricsRegistry.metrics()

src/utils/domain-metrics.ts
  ├─ authLoginTotal        — login outcomes
  ├─ authSignupTotal       — signup outcomes
  ├─ cartCheckoutTotal     — checkout outcomes
  ├─ orderCreatedTotal     — order creation
  ├─ databaseQueryTotal    — Mongoose query count
  ├─ databaseQueryDuration — Mongoose query latency
  ├─ databaseErrorsTotal   — Mongoose errors
  └─ mongooseMetricsPlugin — schema plugin registered globally

src/routes/index.ts
  └─ GET /metrics → metricsRegistry.metrics()
```

---

## Prometheus scrape config

Add this to your `prometheus.yml`:

```yaml
scrape_configs:
    - job_name: 'node-api'
      static_configs:
          - targets: ['localhost:3000']
      metrics_path: /metrics
      scrape_interval: 15s
```

---

## Useful PromQL queries

```promql
# Request rate (per second, 5-minute window)
rate(http_requests_total[5m])

# 95th-percentile latency
histogram_quantile(0.95, rate(http_request_duration_milliseconds_bucket[5m]))

# Error rate
rate(http_request_errors_total[5m]) / rate(http_requests_total[5m])

# Login failure rate
rate(auth_login_total{status="failure"}[5m])

# Checkout conversion
rate(cart_checkout_total{status="success"}[5m])
  / rate(cart_checkout_total[5m])

# Slow DB queries (p99)
histogram_quantile(0.99, rate(db_query_duration_seconds_bucket[5m]))
```

---

## Related docs

- [Observability](./observability.md) — trace context, W3C traceparent
- [Structured Logging](./structured-logging.md) — JSON log format, request access log
- [Audit Logging](./audit-logging.md) — security and compliance events
