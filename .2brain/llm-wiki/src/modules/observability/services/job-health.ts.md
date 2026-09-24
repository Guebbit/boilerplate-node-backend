---
source: src/modules/observability/services/job-health.ts
sha256: 7158b91f56c78a54039a5f2c9882e04e1780c02c0e0176901f41b696cb6ae58e
generated_at: 2026-09-23T18:57:17.667730+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/services/job-health.ts

## Purpose

Provides the job-health slice of the `GET /observability/health` endpoint. Unlike `dependency-health.ts`, this module performs I/O (a single `leases` query) because no in-memory record of scheduled-job outcomes exists in the process. It translates raw lease summaries into the `ObservabilityHealthJob[]` wire shape.

## Key elements

- **`jobHealth(): Promise<ObservabilityHealthJob[]>`** – Sole export. Calls `listLeaseSummaries()`, then maps each summary to `{ name, lastSuccessAt (ISO-8601 string | undefined), lastError }`. No additional filtering or error handling beyond what `listLeaseSummaries` already does.

## Relationships

- **`src/infrastructure/persistence/lease.ts`** – Source of `listLeaseSummaries`, the single I/O call this module makes.
- **`src/modules/observability/controllers/get-observability-health.ts`** – Consumer; calls `jobHealth()` to populate the `jobs` field of the health response.
- **`src/modules/observability/services/index.ts`** – Barrel re-export so controllers can import via the module path.
- **`src/types/index.ts`** – Defines `ObservabilityHealthJob`, the return-type contract.
- **`src/modules/observability/tests/unit/job-health.test.ts`** – Unit tests covering the mapping logic.

## Notes

- Timestamps are emitted as ISO-8601 strings (`.toISOString()`), matching the convention used across the entire health endpoint. `lastSuccessAt` is nulled (via optional chaining) when the job has never succeeded.
- The function is a plain async arrow (not `async/await`) to keep the chain to a single `.then`. Callers receive the same rejection path as `listLeaseSummaries`; there is no local `try/catch`.
- The module doc-block explicitly contrasts this file with `dependency-health.ts` (which is purely in-memory) to prevent future readers from assuming all health sub-modules are I/O-free.
