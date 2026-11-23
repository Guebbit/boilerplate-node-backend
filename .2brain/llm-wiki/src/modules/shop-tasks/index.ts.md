---
source: src/modules/shop-tasks/index.ts
source_sha256: fe85d16fb6376f0873ad68dc527cf760f77414b04d57e02f76da02854d126fc7
context_sha256: 98751ab35390427601e86a8a6ff8675bc37af55fe20e1bf44015fbe6a6d6b385
generated_at: 2026-11-22T07:41:22.233345+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop-tasks/index.ts

## Purpose
Public barrel for the shop-tasks module. It is the only surface that sibling modules may import. The module owns no events of its own, so the barrel publishes the openings rules, the service, and the digest mail.

## Key elements
- `export * from './domain'`: re-exports the domain layer, which per the file's header comment holds the openings rules.
- `export * from './services'`: re-exports the module's service.
- `export * from './emails'`: re-exports the digest mail.

The file defines no logic of its own.

## Relationships
- `src/modules/shop-tasks/domain/index.ts`: its exports are republished here.
- `src/modules/shop-tasks/services/index.ts`: its exports are republished here.
- `src/modules/shop-tasks/emails.ts`: its exports are republished here.

## Notes
- Anything not re-exported here is internal to the module. Siblings should not import from deeper paths.
- Adding a public symbol means exporting it from one of the three re-exported modules. Because the re-exports are `export *`, name collisions between them would need to be avoided.
- The header comment carries `@see` references to design documentation on the "published language — the barrel" and on the module's "neighbourhood". See `src/modules/shop-tasks/module.ts` for the module definition.
