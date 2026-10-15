---
source: src/modules/feedback/index.ts
sha256: a300aa4b7cde90d49aee9f9530664125bc02cf47b15a9dff87739eca91df5f02
generated_at: 2026-10-15T10:32:09.792260+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/index.ts

## Purpose

Public barrel for the feedback module. It is the single re-export surface that sibling modules are allowed to import from (per the DDD strategy rule in `docs/theory/strategic-ddd.md` §5), so external consumers never reach into internal sub-modules directly.

## Key elements

- **`export * from './service'`** — Re-exports all runtime values and types from the feedback service.
- **`export * from './domain'`** — Re-exports all runtime values and types from the domain sub-module.
- **`export * from './emails'`** — Re-exports all runtime values and types related to feedback emails.
- **`export type * from './model'`** — Re-exports **types only** (no runtime values) from the model sub-module.

## Relationships

- **`src/modules/feedback/service.ts`** — Re-exported in full; provides the feedback service API.
- **`src/modules/feedback/domain/index.ts`** — Re-exported in full; provides domain-level constructs.
- **`src/modules/feedback/emails.ts`** — Re-exported in full; provides email-related feedback logic.
- **`src/modules/feedback/model.ts`** — Re-exported as types only; provides the data-shape definitions consumed by the other sub-modules.

## Notes

- The model re-export uses `export type *`, meaning importing from this barrel will never pull in a runtime binding from `model.ts`. If you need a value from model, it does not exist here.
- Because this is the *only* legal import point for sibling modules, adding a new export to any sub-module automatically makes it visible externally — no change to this file is needed, but the public API grows implicitly.
- See `docs/modules/feedback.md` for the module's design rationale.
