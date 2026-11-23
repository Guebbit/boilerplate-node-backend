---
source: src/modules/observability/metrics.ts
source_sha256: 31528c639818f785b4343a1825b51590b6a3fe2edf3736d309720f8f0400d978
context_sha256: ee6b6f03ba2c6c0aadafe49781845ace0ffd3e2387b7b855424fae3ea9af9005
generated_at: 2026-11-22T06:02:00.642332+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/metrics.ts

## Purpose
Defines the `dependency_up` Prometheus gauge, which reports whether each backing service (`database`, `cache`, `queue`) is serving (1) or not (0). It exists to power the `DependencyUnavailable` alert: when Mongo is down, the job and outbox gauges stop reporting, so rules that read them go blind. This gauge is the signal that still reports in that case. Alert rules are documented in `docs/operate/deployment-hardening.md#alert-rules`.

## Key elements
- `_dependencyUp` (not exported): a `prom-client` `Gauge` named `dependency_up` with a single label, `dependency`, registered on `metricsRegistry`.
- `collect()` callback: runs at scrape time. It resets the gauge, then iterates `Object.entries(dependencyHealth())` and sets each dependency to 1 if its status is `ready` and 0 otherwise. Dependencies with status `disabled` are skipped.

## Relationships
- `src/infrastructure/observability/metrics-registry.ts`: provides `metricsRegistry`, the registry this gauge registers on.
- `src/modules/observability/services/dependency-health.ts`: provides `dependencyHealth()`, the source of per-dependency statuses. The file's doc comment says it is the same memory read that `GET /observability/health` uses.
- `src/modules/observability/module.ts` and `src/modules/observability/tests/unit/dependency-up.test.ts`: related in the dependency graph. The file's content does not show how they interact with it.

## Notes
- The file has side effects on import: the gauge registers as soon as the module loads, and nothing is exported.
- Scrapes cost no I/O, because `dependencyHealth()` reads memory. The gauge still answers when the dependency itself is unreachable.
- A `connecting` status is reported as 0. The alert rule's `for` clause is meant to absorb a normal startup.
- A `disabled` dependency, such as Redis or RabbitMQ not configured, is left unset rather than 0. Absence is treated as a supported deployment, not a fault.
- `reset()` runs before each collection, so a dependency that is no longer reported drops out of the output instead of keeping a stale value.
