---
source: src/modules/access/index.ts
source_sha256: 72439cfe6174e0be4c61fc4deebb0260198c9ad48d882a274a8e56890ce57cbd
context_sha256: 6faa86cbd54de24001b6e2d842762647f86b6ceab8e1d221f00ae27975c06be3
generated_at: 2026-11-22T03:16:06.959038+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/access/index.ts

## Purpose
Public barrel for the `access` module. Per its doc comment, it is the only surface a sibling module may import. It re-exports the module's services and pure domain rules, and exposes the model's document types as types only.

## Key elements
- `export * from './services'`: publishes the access services.
- `export * from './domain'`: publishes the pure rules in `domain/`.
- `export type * from './model'`: publishes only the types from `model.ts`, such as `TenantDocument` and `MembershipDocument`. The runtime schemas are not exported.

## Relationships
- `src/modules/access/services/index.ts` and `src/modules/access/domain/index.ts` are re-exported wholesale, so their public names become part of this module's surface.
- `src/modules/access/model.ts` is re-exported as types only.
- The neighbor files (account module session, roles, two-factor enrollment, and tests; `scenarios/accounts.ts`; `scripts/db/bootstrap-access.ts`) sit in the dependency graph around this barrel. The file itself contains no logic that ties it to them.

## Notes
- `repository.ts` is deliberately not exported, and neither are the runtime schemas in `model.ts`. The doc comment says this is the same for every module.
- Anything new that sibling modules need must be re-exported through `services/` or `domain/`, or added here. Otherwise it is not public.
- The doc comment points to documentation on where authorization lives and on the "published language — the barrel" rule in strategic DDD, for the reasoning behind this convention.
