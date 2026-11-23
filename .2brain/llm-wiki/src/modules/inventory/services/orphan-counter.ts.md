---
source: src/modules/inventory/services/orphan-counter.ts
source_sha256: ef6fc1dc515713ce5e6ddbd75ad4f081c71764e5ac5542f6d4f82afd97812841
context_sha256: 5c37d76482e228125e1b9cca919e3733acf4d6fd89bbc0316392b477d24b1f9a
generated_at: 2026-11-22T05:23:00.392877+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/services/orphan-counter.ts

## Purpose
Defines the Prometheus counter behind the `PaidOrderWithoutHold` alert. It is kept separate from `src/modules/cart/metrics.ts` on purpose. That file registers two gauges whose `collect` queries the database, so importing it here would put those gauges on the registry of every test or process that only imports the holds. Runbook: `src/modules/inventory/services/transition.ts` (the "orphaned-hold" section referenced in the file's comments).

## Key elements
- `inventoryCommitOrphanedTotal`: a `prom-client` `Counter` named `inventory_commit_orphaned_total`.
  - It counts paid or shipping orders that have no hold to settle.
  - It has one label, `stage`, which is `commit` (payment) or `ship` (dispatch).
  - It is registered on `metricsRegistry`.
- Module-level loop: calls `inc({ stage }, 0)` for `commit` and `ship` at load. Both series exist at zero from startup, so an `increase()` alert sees the first orphan after a restart.

## Relationships
- `src/infrastructure/observability/metrics-registry.ts`: supplies `metricsRegistry`, the registry the counter is registered on.
- `src/modules/inventory/services/holds.ts`: its `raiseOrphanAlarm` takes the stages that this file pre-initialises (`commit`, `ship`). The comment here names it as the source of those stages.
- `src/modules/inventory/tests/integration/service.test.ts`: a graph neighbour. Nothing in this file refers to it.

## Notes
- `ship` fires only when no hold exists at all. `commit` also fires for a released hold that the shelf could not cover when the payment landed.
- Any increase needs a human decision. The counter is not an automatic-remediation signal.
- A new `stage` value must be added to the pre-initialisation list. The loop hard-codes `['commit', 'ship']`.
