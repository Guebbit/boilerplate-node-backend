---
source: src/modules/access/index.ts
sha256: 5e07aac1f28bb91ca782a58564593feddb0552244849e59ae94134d832aedb25
generated_at: 2026-10-29T02:22:05.045508+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/index.ts

## Purpose

Public barrel (entry point) for the Access module. Sibling modules are restricted to importing **only** from this file (per `docs/theory/strategic-ddd.md` §5); it curates what is exposed externally while keeping internal runtime schemas private.

## Key elements

- **`export * from './services'`** — re-exports every value and type from the services layer.
- **`export type * from './model'`** — re-exports model symbols **as types only** (no runtime values leak out).

## Relationships

- **`src/modules/access/services/index.ts`** — sole value re-export source; all runtime access logic flows through here.
- **`src/modules/access/model.ts`** — sole type re-export source; `TenantDocument` and `MembershipDocument` are surfaced to consumers exclusively as TypeScript types.
- **`src/modules/account/*`, `src/modules/api-keys/*`, `scenarios/`, `scripts/`** — downstream consumers that import the Access API through this barrel rather than reaching into sub-path files.

## Notes

- `repository.ts` exists inside the module but is **deliberately not exported** here; the JSDoc calls out that its runtime schemas (like those in `model.ts`) stay unpublished, consistent with the module's encapsulation rule.
- Because the model re-export uses `export type *`, importing a model symbol at a value position (e.g. calling a Zod schema method) will fail at compile time — use the services layer for runtime access to schema behavior.
- Canonical theory reference: `docs/theory/authorization.md`.
