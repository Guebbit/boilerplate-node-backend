# src/modules/audit-logs/metrics.ts

## Purpose

Defines the single Prometheus counter that the audit-logs module owns, tracking how many audit entries made it into the compliance log but were lost on the path to the queryable trail. It lives in the module (not in `infrastructure/`) following the same pattern as `modules/account/metrics.ts`, so the overview endpoint can read the value without a direct import of this file.

## Key elements

- **`auditSinkFailuresTotal`** (`Counter`, exported) — A Prometheus counter (`audit_sink_failures_total`) registered against the shared `metricsRegistry`. Incremented when an audit entry is written to the compliance log but fails to persist to the queryable trail.

## Relationships

- **`src/infrastructure/observability/metrics-http.ts`** — Provides the `metricsRegistry` instance that this counter registers with, making it visible to the `/observability/audit` endpoint and any other exposition the HTTP layer exposes.
- **`src/modules/audit-logs/service.ts`** — The service's `record()` method is the expected caller that increments this counter when a persistence failure is swallowed.
- **`src/modules/audit-logs/tests/unit/service.test.ts`** — Unit tests for the service; likely assert the counter increments on the swallow-and-continue path.

## Notes

- The fail-open design is **intentional**: `record()` deliberately swallows persistence errors so that `GET /observability/audit` returning `{ items: [] }` is indistinguishable from "nothing happened." The doc comment explicitly warns against making the sink awaitable to drive this counter to zero — the counter exists to *measure* the gap, not to *eliminate* it.
- This file is a pure definition (one `Counter` + one import). There is no logic, no conditionals, no side effects beyond the counter construction.
