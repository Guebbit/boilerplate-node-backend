---
source: src/modules/inventory/services/orphan-counter.ts
sha256: e0b67f8aa8fa0e6e5bf55e7ef2ac8f8455b729437ac78378e9553f94bd16c4f8
generated_at: 2026-11-08T06:02:58.759441+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/orphan-counter.ts

## Purpose

Defines a single Prometheus counter (`inventory_commit_orphaned_total`) that backs the **PaidOrderWithoutHold** alert. It is deliberately kept in its own module—separate from `../metrics.ts`—so that importing `holds.ts` in tests or auxiliary processes does not also pull in two DB-querying gauges onto every process's metrics registry.

## Key elements

- **`inventoryCommitOrphanedTotal`** (exported) – A `prom-client` `Counter` labelled by `stage` (`'commit'` | `'ship'`). Records paid-or-shipping orders found with no settleable hold. Pre-initialised to zero for both labels so an `increase()` alert fires on the first orphan after a restart.

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** – Imports `metricsRegistry` and passes it as the `registers` target so the counter lands on the app-level registry.
- **`src/modules/inventory/services/holds.ts`** – The `raiseOrphanAlarm` function in this file is the caller that increments the counter (with the appropriate `stage` label) when an orphaned order is detected.
- **`src/modules/inventory/tests/integration/service.test.ts`** – Integration tests that exercise the holds/orphan flow; the module's separation was specifically designed to keep these tests from accidentally registering the DB-backed gauges.

## Notes

- **Why a separate file:** `../metrics.ts` registers gauges whose `collect` callback queries the database. Co-locating this counter there would force every import of `holds.ts` (including unit tests) to load those gauges.
- **Label semantics:** `ship` increments only when *no* hold exists at all; `commit` increments both for a missing hold and for a released hold the shelf could not cover at payment time. The distinction matters for the runbook fix.
- **Alert, not auto-remediation:** Any increase is a human-in-the-loop signal, not something the system corrects on its own.
- **Zero-initialisation loop** follows the [Prometheus instrumentation best practice](https://prometheus.io/docs/practices/instrumentation/#avoid-missing-metrics) of avoiding missing series.
