---
source: src/modules/audit-logs/index.ts
sha256: 48f6b6c18b2f577f90f025255a2c46d403ea47261067c669aefe12177eee1b80
generated_at: 2026-09-23T18:26:27.725580+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/index.ts

## Purpose

Public barrel (single import surface) for the audit-logs module. Sibling modules must import only through this file rather than reaching into `service.ts` or `model.ts` directly, enforcing the strategic DDD encapsulation rule.

## Key elements

- `export * from './service'` — re-exports all runtime values (functions, classes) from the audit-logs service.
- `export type * from './model'` — re-exports **only types** from the model, keeping model internals out of the value namespace.

## Relationships

- **`src/modules/audit-logs/model.ts`** — type-only re-export source.
- **`src/modules/audit-logs/service.ts`** — full re-export source.
- **`src/modules/observability/controllers/get-observability-audit.ts`** — consumer that imports audit-log symbols through this barrel rather than from the internal files.

## Notes

- The doc comment references `docs/theory/strategic-ddd.md` §5 as the authority for the single-barrel rule.
- The comment mentions `module.ts` "registers the write path itself at import time," but `module.ts` is **not** imported or re-exported here; it is a side-effect module loaded elsewhere. Do not expect side effects from importing this barrel.
- The type-only re-export (`export type *`) means no runtime code from `model.ts` is emitted through this entry point.
