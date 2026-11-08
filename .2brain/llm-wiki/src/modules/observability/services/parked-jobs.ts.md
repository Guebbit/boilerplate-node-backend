---
source: src/modules/observability/services/parked-jobs.ts
sha256: cba4e4d43230cea2d439d916af1eb08833a8012b8dadb5d5ca6b4821d6174a83
generated_at: 2026-11-08T06:41:22.698429+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/services/parked-jobs.ts

## Purpose

Provides the queue (dead-letter) portion of the `GET /observability/health` response. It reads each worker queue's parked-job count live from the message broker, since that figure lives nowhere in this process's memory. It exists as a thin, named wrapper so the health endpoint can compose it alongside other sub-checks without inlining broker I/O.

## Key elements

- **`queueHealth(): Promise<ObservabilityHealthQueue[]>`** — The sole export. Delegates directly to `parkedCounts()` and returns the result in the wire shape declared by `ObservabilityHealth.queues`. For queues the broker could not reach, the entry is **empty** (absent) rather than zero-filled, so consumers can distinguish "no parked jobs" from "unknown."

## Relationships

- **`src/infrastructure/adapters/queue.ts`** — Source of `parkedCounts()`, the only I/O call this module makes. All broker interaction lives there; this file adds no logic beyond the delegation.
- **`src/modules/observability/services/health.ts`** — Composes `queueHealth()` with other sub-checks (dependency health, job leases, etc.) into the full health payload returned by the endpoint.
- **`src/modules/observability/services/index.ts`** — Barrel file that re-exports `queueHealth` for consumers of the observability services.
- **`src/modules/observability/tests/unit/parked-jobs.test.ts`** — Unit tests covering the delegation and the empty-vs-zero semantics.
- **`src/types/index.ts`** — Defines the `ObservabilityHealthQueue` type that shapes the return value.

## Notes

- Despite the filename "parked-jobs," this file has no job-lookup logic of its own; all work is in `parkedCounts()`. The name reflects the *domain concept* it surfaces, not an implementation detail.
- The intentional **empty-array** (not `0`) behavior for unreachable queues is a deliberate design choice: a false zero would mask a real problem. Any consumer of this value must treat missing entries as "unknown," not "healthy."
- The module docblock references `docs/tools/prometheus.md` for the broader observability story.
