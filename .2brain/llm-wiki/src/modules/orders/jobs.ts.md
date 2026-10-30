---
source: src/modules/orders/jobs.ts
sha256: bee402e8cf3750b2470c502fb36f0fab758602fe0e7da1dcfc3820385973e890
generated_at: 2026-10-29T04:42:46.522264+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/jobs.ts

## Purpose

Declares the scheduled job(s) owned by the `orders` module — currently a single retention-scrub job that anonymizes due orders and then scrubs timeline text. This file is the registration surface that ties together the generated job metadata and the service functions that perform the actual work.

## Key elements

- **`ordersJobs`** (exported `readonly JobDeclaration[]`) — The sole export. A single-element array containing the `reapOrders` job declaration.
  - Spreads `ordersJobData.reapOrders` (name, schedule, etc.) from the generated file.
  - Overrides `run` with a composed pipeline: `anonymizeDueOrders()` → `scrubTimelineText()`, resolving to the count of anonymized orders.

## Relationships

- **`src/kernel/registry.ts`** — Provides the `JobDeclaration` type that `ordersJobs` is typed against.
- **`src/modules/orders/jobs.generated.ts`** — Source of `ordersJobData.reapOrders` (schedule, display name, and other static metadata). The `run` field here is intentionally overwritten.
- **`src/modules/orders/services/retention.ts`** — Supplies `anonymizeDueOrders()`, the primary work unit of the job.
- **`src/modules/orders/services/timeline.ts`** — Supplies `scrubTimelineText()`, the follow-up cleanup step.
- **`src/modules/orders/module.ts`** — Consumes `ordersJobs` to register the module's job(s) with the kernel.

## Notes

- The `run` closure chains the two service calls sequentially; `scrubTimelineText` is awaited *before* the promise resolves, but its return value is discarded — only the anonymized count propagates upward (reported by the demo-profile job lever).
- Because the array is `readonly`, callers (e.g. `module.ts`) must not mutate it.
- Adding a new job means appending another object to the array; there is no dynamic registration mechanism in this file.
