---
source: src/modules/access/index.ts
sha256: c3766eb40435fde48418ad760b12e6e18d63296c0ca7ee6220b62afbc7a89128
generated_at: 2026-11-14T18:25:44.670255+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/index.ts

## Purpose

Public barrel for the **access** module. It is the *only* import surface a sibling module is allowed to use (enforced by the module-boundary rule in `docs/theory/strategic-ddd.md` §5). It re-exports the service layer and pure domain rules while deliberately keeping runtime schemas and persistence details internal.

## Key elements

- **`export * from './services'`** — re-exports the full public API of the access service layer.
- **`export * from './domain'`** — re-exports pure domain rules (guards, predicates, type-level contracts).
- **`export type * from './model'`** — re-exports **type-only** names from the model layer (e.g. `TenantDocument`, `MembershipDocument`). No runtime values from `model.ts` are published.

## Relationships

- **`src/modules/access/services/index.ts`** — re-exported in full; this is the primary functional surface of the module.
- **`src/modules/access/domain/index.ts`** — re-exported in full; provides pure rules consumed by services and by external callers.
- **`src/modules/access/model.ts`** — re-exported as types only.
- **`scripts/db/bootstrap-access.ts`** — downstream consumer that imports through this barrel to seed access data.
- **`src/modules/account/*`** (roles, session, two-factor, tests, scenarios) — sibling modules that consume the access surface for their own authorization needs, importing only via this barrel.

## Notes

- The barrel is intentionally thin: any new public symbol must flow through `services/` or `domain/`. Adding a re-export here is the module's contract with the rest of the codebase.
- `model.ts` is exported with `export type *`, so `import { TenantDocument }` works but any runtime helper defined in `model.ts` will **not** resolve. This is a deliberate encapsulation choice.
- Per the file's own doc comment, runtime schemas in `model.ts` and any repository-level logic are kept module-internal and are *not* re-exported through this barrel.
