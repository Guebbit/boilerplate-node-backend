---
source: src/modules/returns/presenter.ts
sha256: cef15ded3e7319b1b9da97d55ab65935669d6d6104298d436c98df7ce74bb50b
generated_at: 2026-11-08T08:00:48.143742+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/presenter.ts

## Purpose

Single transformation point that converts a stored `ReturnDocument` into the wire-contract shape (`StoredReturn`). It isolates the `_id` → `id` and date-to-ISO-string serialization so the rest of the codebase deals only with the typed contract. The read service layers `actions` on top of this result.

## Key elements

- **`StoredReturn`** (type export) — `Omit<Return, 'actions'>`. The contract shape minus the caller-specific actions field.
- **`presentReturn`** (function export) — Accepts a `ReturnDocument`, calls its `.toJSON()`, and casts the result to `StoredReturn`. This is the only place the raw document is widened into the public type.

## Relationships

- **`./model`** — Imports `ReturnDocument`, the input type for `presentReturn`.
- **`@types` (`src/types/index.ts`)** — Imports the `Return` contract type used to define `StoredReturn`.
- **`services/read.ts`** — Consumes `StoredReturn` (the output of `presentReturn`) and augments it with `actions` to produce the full `Return` returned to callers.

## Notes

- The `as StoredReturn` cast in `presentReturn` is deliberate and documented: the compiler cannot infer that `toJSON()` returns the exact shape of `StoredReturn`, so the cast is the one sanctioned narrowing. Do not replace it with a re-implementation of the field mapping.
- `actions` is intentionally absent from `StoredReturn`. If you need actions, go through the read service; do not add them here.
