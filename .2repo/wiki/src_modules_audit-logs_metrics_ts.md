# src/modules/audit-logs/metrics.ts

## Purpose

Defines the Prometheus counter for audit-log persistence failures. It exists so that silent, fail-open drops of audit entries into the queryable trail become visible on an existing dashboard instead of looking like "nothing happened." The counter lives in the module (not infrastructure) following the same convention as `modules/account/metrics.ts`.

## Key elements

- **`auditSinkFailuresTotal`** (`Counter`, exported) — Prometheus counter, metric name `audit_sink_failures_total`. Increments when an audit entry is written to the log but not persisted to the queryable trail. Registered against the shared `metricsRegistry`.

## Relationships

- **`src/infrastructure/observability/metrics-http.ts`** — provides `metricsRegistry`, the shared `Registry` instance this counter registers into. This is the sole import from that file.
- **`src/modules/audit-logs/service.ts`** — the fail-open sink that catches persistence errors; expected to increment `auditSinkFailuresTotal` on the error path.
- **`src/modules/audit-logs/tests/unit/service.test.ts`** — unit tests for the service; may assert that the counter is incremented when persistence fails.

## Notes

- The fail-open behavior (swallowing the persistence error so a rejected login never becomes a 500) is **intentional by design**, not a gap. Do not make the sink awaitable or retrying to drive this counter to zero.
- The trail is still intact in the application logs; nothing is lost. The counter exists purely to make the *absence* of data in the queryable endpoint noticeable on a graph.
- A counter (not an alert, not a retry) was chosen deliberately: it turns "the sink has been failing for an hour" into a visible trend in the already-built observability dashboard.
