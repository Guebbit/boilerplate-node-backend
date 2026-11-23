---
source: src/modules/audit-logs/index.ts
source_sha256: c9ed82e65e326a3d36cc0fcd7abb78338a856bccc0ae24c46bc7cbf47d720cc0
context_sha256: 674528b4b9bb39540c4a3f043e68b238c365b8843ba5413b13c20c97b362628d
generated_at: 2026-11-22T04:26:28.433157+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/audit-logs/index.ts

## Purpose
Public barrel for the audit-logs module. Per its doc comment, it is the only surface sibling modules may import from this module. It re-exports the module's service and its model types.

## Key elements
- `export * from './service'`: re-exports all runtime exports of `service.ts`.
- `export type * from './model'`: re-exports only the types from `model.ts`, so no runtime values leak from the model.

## Relationships
- `./service`: all of its exports are surfaced here.
- `./model`: its types are surfaced here (type-only).
- `src/modules/observability/controllers/get-observability-audit.ts`: a graph neighbor in another module. Per the barrel rule, it should consume audit-logs through this file rather than through internal paths. The file content does not show what it imports.

## Notes
- The doc comment says that the module's `module.ts` registers the write path from its `onRegistered` hook.
- Anything not exported here is internal to the module. Adding a new public export means adding it to `service.ts` or `model.ts` (or a new `export` line here).
