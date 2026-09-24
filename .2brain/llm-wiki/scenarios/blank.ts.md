---
source: scenarios/blank.ts
sha256: c31a8af7fba492ef23436b23e1c23ce46029ab3e8e4cd6b30474104205b5b893
generated_at: 2026-09-23T17:17:00.035313+00:00
model: ollama:qwen3.8:27b
---

# scenarios/blank.ts

## Purpose

The `blank` scenario seeds only the minimum harness infrastructure a SPEC needs before creating its own shop-shaped data: the access model, the four named accounts, and the fallback locale. It contains no catalogue, orders, or carts. Behaviour e2e specs that create what they assert restore into `blank` rather than into `shop`, making this the "clean slate" target.

## Key elements

- **`seedBlank`** (exported function) — Seeds the scenario in two phases: first `seedAccessModel()` (because nothing can resolve a caller until a shop exists), then `seedNamedUsersCollection()` and `seedLocalesCollection()` concurrently via `Promise.all` (neither reads the other's write). Returns a single `SeedOutcome[]` combining both concurrent results.
- **Module type** — `@module` JSDoc tag; no default export, only the named `seedBlank` export.

## Relationships

- **`scenarios/seed.ts`** — Provides the `SeedOutcome` type used as `seedBlank`'s return type.
- **`scenarios/accounts.ts`** — Source of `seedAccessModel`, which must complete before the concurrent phase.
- **`scenarios/users.ts`** — Source of `seedNamedUsersCollection`, run concurrently with locales.
- **`scenarios/locales.ts`** — Source of `seedLocalesCollection`, run concurrently with users.
- **`scenarios/index.ts`** — Reads `seedBlank` through the `SCENARIOS` registry; this function is never called directly by specs.

## Notes

- The two-phase sequencing (access model → concurrent accounts + locales) is intentional: a shop membership must exist before named accounts can be resolved, but accounts and locales have no interdependency.
- Despite the name, `blank` is not truly empty—it always provides the four named accounts and at least one active locale. "Blank" means *no shop-shaped data*, not *no data at all*.
