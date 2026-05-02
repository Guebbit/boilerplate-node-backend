# Prometheus Metrics (Phase 2)

> **TL;DR** — Hit `GET /metrics` to get all operational data in Prometheus text format. No config needed; it just works.

---

## 🗺️ How it all fits together

```text
                    ┌─────────────────────────────────────────────────────┐
                    │                  Node.js App                        │
  HTTP Request ───▶ │                                                     │
                    │  [httpMetricsMiddleware]                            │
                    │    ├─ inFlightRequests.inc()                        │
                    │    └─ on finish:                                    │
                    │         ├─ inFlightRequests.dec()                  │
                    │         ├─ httpRequestsTotal.inc(method,route,status)│
                    │         ├─ httpRequestDurationMs.observe(ms)        │
                    │         └─ httpErrorsTotal.inc()  (if 4xx/5xx)     │
                    │                                                     │
                    │  [Domain controllers]                               │
                    │    ├─ loginSuccessTotal / loginFailureTotal         │
                    │    ├─ signupTotal                                   │
                    │    ├─ checkoutSuccessTotal / checkoutFailureTotal   │
                    │    └─ orderCreatedTotal                             │
                    │                                                     │
                    │  [Mongoose global plugin]                           │
                    │    ├─ mongoQueryDurationMs.observe(ms)              │
                    │    └─ mongoQueryTotal.inc(collection, op)           │
                    │                                                     │
                    │  [prom-client collectDefaultMetrics()]              │
                    │    └─ CPU, memory, event-loop lag, GC, handles      │
                    │                                                     │
                    │  GET /metrics ◀─────────────────────────────────── Prometheus scraper
                    │    └─ register.metrics() → text/plain              │  (every ~15s)
                    └─────────────────────────────────────────────────────┘
```

---

## ✅ What metrics are exposed

### HTTP layer

| Metric | Type | Labels | What it tells you |
|---|---|---|---|
| `http_requests_total` | Counter | method, route, status_code | Request volume per endpoint |
| `http_request_duration_milliseconds` | Histogram | method, route | Latency distribution |
| `http_errors_total` | Counter | method, route, status_code | Error volume (4xx + 5xx only) |
| `http_in_flight_requests` | Gauge | — | Active requests right now |

### Domain / business

| Metric | Type | What it tells you |
|---|---|---|
| `auth_login_success_total` | Counter | Successful logins |
| `auth_login_failure_total` | Counter | Failed logins (wrong password, unknown user…) |
| `auth_signup_total` | Counter | New registrations |
| `cart_checkout_success_total` | Counter | Checkouts that produced an order |
| `cart_checkout_failure_total` | Counter | Checkouts that failed |
| `order_created_total` | Counter | Orders created (cart or admin) |

### MongoDB

| Metric | Type | Labels | What it tells you |
|---|---|---|---|
| `mongodb_query_duration_milliseconds` | Histogram | collection, operation | Query latency per collection |
| `mongodb_queries_total` | Counter | collection, operation | Query throughput |
| `mongodb_query_errors_total` | Counter | collection, operation | DB-level errors |

### Process / runtime (via `collectDefaultMetrics`)

| Metric | What it tells you |
|---|---|
| `process_uptime_seconds` | How long the process has been running |
| `process_resident_memory_bytes` | RAM consumed by the process |
| `nodejs_eventloop_lag_seconds` | Event-loop saturation (spike = CPU bottleneck) |
| `nodejs_gc_duration_seconds` | Time spent in garbage collection |
| `process_cpu_seconds_total` | CPU usage |
| `process_runtime_errors_total` | Uncaught runtime exceptions |

---

## 🚀 Quick start

```bash
# Read all metrics (one command)
curl http://localhost:3000/metrics

# Sample output snippet
# HELP http_requests_total Total number of HTTP requests handled.
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/products",status_code="200"} 42

# HELP http_in_flight_requests Number of HTTP requests currently being processed.
# TYPE http_in_flight_requests gauge
http_in_flight_requests 3
```

---

## 🔧 How to wire up Prometheus

In your `prometheus.yml` scrape config:

```yaml
scrape_configs:
  - job_name: 'node-api'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: /metrics
    scrape_interval: 15s
```

That's it. Prometheus will poll `/metrics` every 15 seconds and store the time series.

---

## 📊 Useful Prometheus queries (PromQL)

```promql
# Request rate over last 5 minutes (per route)
rate(http_requests_total[5m])

# Error rate (percentage)
rate(http_errors_total[5m]) / rate(http_requests_total[5m]) * 100

# 95th percentile latency
histogram_quantile(0.95, rate(http_request_duration_milliseconds_bucket[5m]))

# Login failure rate
rate(auth_login_failure_total[5m])

# Checkout conversion (success vs attempt)
rate(cart_checkout_success_total[5m])
  / (rate(cart_checkout_success_total[5m]) + rate(cart_checkout_failure_total[5m]))

# Slow MongoDB queries (95th percentile)
histogram_quantile(0.95, rate(mongodb_query_duration_milliseconds_bucket[5m]))
```

---

## 🗂️ Code map

```text
src/utils/observability.ts
  ├─ collectDefaultMetrics()          ← prom-client built-in process/runtime metrics
  ├─ httpRequestsTotal                ← Counter
  ├─ httpRequestDurationMs            ← Histogram
  ├─ httpErrorsTotal                  ← Counter (4xx/5xx only)
  ├─ httpInFlightRequests             ← Gauge
  ├─ processRuntimeErrorsTotal        ← Counter (uncaughtException)
  ├─ process_uptime_seconds           ← Gauge (collect() callback)
  ├─ recordRequestMetric()            ← called on response finish
  ├─ inFlightRequests.inc/dec()       ← called from app middleware
  └─ getPrometheusMetrics()           ← async, returns register.metrics()

src/utils/domain-metrics.ts
  ├─ loginSuccessTotal / loginFailureTotal
  ├─ signupTotal
  ├─ checkoutSuccessTotal / checkoutFailureTotal
  ├─ orderCreatedTotal
  ├─ mongoQueryDurationMs             ← Histogram
  ├─ mongoQueryTotal                  ← Counter
  └─ mongoQueryErrorsTotal            ← Counter

src/utils/database.ts
  └─ mongoose.plugin(timingPlugin)    ← global pre/post hooks for query timing

src/routes/index.ts
  └─ GET /metrics                     ← calls getPrometheusMetrics()

src/app.ts
  └─ inline middleware                ← inFlightRequests + recordRequestMetric on finish
```

---

## ❓ FAQ

**Q: Why use prom-client instead of a custom implementation?**
prom-client is the standard Prometheus client for Node.js. It handles the text format spec, label escaping, histogram cumulative bucket calculation, and async collection properly. Building your own is error-prone.

**Q: Are metrics shared across cluster workers?**
No. Each Node.js worker process has its own prom-client registry. When using cluster mode, either aggregate at the Prometheus level (sum) or use an external aggregation layer.

**Q: Where is the `/metrics` route defined?**
`src/routes/index.ts` — the system routes file.

**Q: Why is there a separate `http_errors_total` counter when `http_requests_total` already carries the status code?**
Convenience. `http_errors_total` lets you write a simple alert rule like `rate(http_errors_total[5m]) > 0.1` without having to filter `status_code =~ "4..|5.."` in every query.

---

## Related docs

- [Observability](./observability.md) — trace context, traceparent header propagation
- [Structured Logging](./structured-logging.md) — JSON log format, request access log
- [Audit Logging](./audit-logging.md) — security and compliance events
