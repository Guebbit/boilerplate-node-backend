---
source: src/modules/orders/jobs.ts
sha256: bee402e8cf3750b2470c502fb36f0fab758602fe0e7da1dcfc3820385973e890
generated_at: 2026-11-08T06:52:25.046059+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/jobs.ts

## Purpose

Declares the single scheduled job (`reapOrders`) that the orders module owns: a retention scrub that anonymizes overdue orders and then strips their data from timeline text. The file exists so the kernel's job registry can discover and invoke this work without the orders module hard-coding scheduling logic elsewhere.

## Key elements

- **`ordersJobs: readonly JobDeclaration[]`** — the sole export. A one-element array describing the `reapOrders` job. The `run` closure chains `anonymizeDueOrders()` → `scrubTimelineText()` and resolves with the anonymized count (used by the demo profile's job lever).
- **`...ordersJobData.reapOrders`** — spread from the generated file `./jobs.generated`; supplies the static declaration fields (name, schedule, metadata) so only the runtime `run` body lives here.

## Relationships

- **`src/kernel/registry.ts`** — source of the `JobDeclaration` type that shapes every entry in `ordersJobs`.
- **`src/modules/orders/module.ts`** — the module entry point that registers `ordersJobs` with the kernel so the scheduler picks it up.
- **`src/modules/orders/services/retention.ts`** — provides `anonymizeDueOrders`, the first step of the job.
- **`src/modules/orders/services/timeline.ts`** — provides `scrubTimelineText`, the second step (runs after anonymization, before the promise resolves).

## Notes

- The `run` closure intentionally returns the anonymized *count* (not `void`) because the demo profile's job lever surfaces it; don't "clean up" the extra `.then` without removing that contract.
- `ordersJobData` comes from a generated file (`jobs.generated`); regenerate it rather than editing declaration fields by hand.
- `scrubTimelineText()` is awaited inside the chain but its result is discarded — only its side-effects (timeline text removal) matter to the job.
