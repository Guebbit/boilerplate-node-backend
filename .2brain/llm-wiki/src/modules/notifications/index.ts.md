---
source: src/modules/notifications/index.ts
source_sha256: 062050fcc0c651ad78573f291d2ccb889ab1243d141bd2c059a60603e8100e59
context_sha256: 509d3688bc9de3d5221cb9c8b26f65039676e5f79f16dbd322d42b83f131bfc4
generated_at: 2026-11-22T05:53:45.932914+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/index.ts

## Purpose
Public barrel for the notifications module. Per its doc comment, it is the only surface sibling modules may import. A sibling that wants to tell a user something usually emits a domain event. One that writes a notice itself, or reads who works a set, calls the service published here.

## Key elements
- `export * from './services'`: re-exports the module's services (runtime values).
- `export * from './emails'`: re-exports the email-related exports (runtime values).
- `export type * from './model'`: re-exports model types only.
- `export type * from './presenter'`: re-exports presenter types only.

The file defines no logic of its own.

## Relationships
- `src/modules/notifications/services/index.ts` and `src/modules/notifications/emails.ts` are the sources of the value re-exports.
- `src/modules/notifications/model.ts` and `src/modules/notifications/presenter.ts` are the sources of the type-only re-exports.
- `src/modules/shop-tasks/services/digest.ts`, `notices.ts`, `outcome-unknown.ts` and `src/modules/shop-tasks/staff-routing.ts` are neighbors in the dependency graph, consistent with being consumers of this barrel.
- The `shop-tasks` integration tests (delayed, digest, notices, outcome-unknown, staff-notices, tasks) and the unit test `staff-routing.test.ts` are also neighbors in the graph, consistent with consuming it.

## Notes
- Sibling modules should import from this barrel, not from internal files such as `./services` or `./model` directly.
- Models and presenters are exported as types only, so they cannot be used as runtime values through this barrel.
- The doc comment references documentation on the "published language — the barrel" pattern and on the module's neighbourhood.
