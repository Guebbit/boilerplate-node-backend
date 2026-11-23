---
source: src/modules/stats/index.ts
source_sha256: 9825628ebc5ccc931c6dba652dfe57eda0581a8bb034664debb56b460a19286f
context_sha256: a3064acfcd3a99eaf9d5633e94633c5cf1b8fcc32f9933d11dec44582d4d6c82
generated_at: 2026-11-22T07:51:09.626760+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stats/index.ts

## Purpose
Public barrel for the Stats module. It is the only surface that sibling modules may import from. Per its own doc comment, nothing depends on this module today. The barrel exists because every module publishes one.

## Key elements
- `export * from './services'`: re-exports everything the services layer exposes.
- `export * from './domain'`: re-exports everything the domain layer exposes.

The file defines no logic of its own.

## Relationships
- `src/modules/stats/services/index.ts`: its exports are re-exported unchanged.
- `src/modules/stats/domain/index.ts`: its exports are re-exported unchanged.

## Notes
- Both re-exports are wildcards, so the public API is whatever those two sub-barrels export. A name exported by both would conflict.
