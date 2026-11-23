---
source: src/modules/observability/services/parked-jobs.ts
source_sha256: 9a296fb37b1f634f58fe624ccbb752c04a57ee81b82915f13d16f72b6ad98d0d
context_sha256: fbdf0fbfdd140a16fd8c44d18a68d792e5695cc068555ec5b01e0f6452d3c014
generated_at: 2026-11-22T06:03:35.549316+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/services/parked-jobs.ts

## Purpose
Provides the queue half of `GET /observability/health`: the current dead-letter ("parked") depth of every worker queue, read live from the broker. It does real I/O because a queue's parked count isn't held in this process's memory. This is the same reasoning `job-health.ts` gives for its `leases` query, and it is unlike `dependency-health.ts`. Alert-rule context is documented in `docs/operate/deployment-hardening.md`.

## Key elements
- `queueHealth()`: the only export. It returns `Promise<ObservabilityHealthQueue[]>`, the wire shape declared by `ObservabilityHealth.queues`. It delegates entirely to `parkedCounts()`.

## Relationships
- **`src/infrastructure/adapters/queue.ts`**: supplies `parkedCounts`, which does the broker read. Its docblock explains the partial-result behavior.
- **`src/types/index.ts`**: supplies the `ObservabilityHealthQueue` type, imported via the `@types` alias.
- **`src/modules/observability/services/health.ts`** and **`src/modules/observability/services/index.ts`**: sit next to this file in the graph, and `queueHealth` is consumed through them. The file's own content doesn't show how.
- **`src/modules/observability/tests/unit/parked-jobs.test.ts`**: unit tests for this module.

## Notes
- If a queue can't be reached, its entry is omitted from the result rather than reported as zero. A partial answer is preferred to a false "nothing is parked."
- The file adds no logic of its own. Behavior changes belong in `parkedCounts`.
