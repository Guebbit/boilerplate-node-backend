---
source: src/kernel/access/query.ts
sha256: 07a9f289a840757a9f9e8efac33d07ce1f4cda8d6db017381d9e7553d5692344
generated_at: 2026-09-23T17:54:33.120790+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/access/query.ts

## Purpose

Compiles a caller's CASL rules into a MongoDB filter fragment via `@casl/mongoose`, so the data-level restriction is baked into the read query itself. It exists to replace per-module hand-rolled filter fragments with a single, rule-derived artefact, and to fail closed (match nothing) rather than fail open (match everything) when no rule applies.

## Key elements

- **`accessibleFilter`** (export) — Resolves the caller for a subject/action, runs `accessibleBy` from `@casl/mongoose`, then post-processes the result through `toStorage` and `collapse`. Returns a `Record<string, unknown>` fragment to be spread into a query.
- **`UNSTORED_FIELDS`** — Set of rule fields that have no column in this deployment's collections (currently `tenantId`). Matching branches are dropped during compilation.
- **`coerce`** — Field-level value coercion map. Currently maps `userId` from string → `Types.ObjectId` to prevent a silent no-match.
- **`toStorage`** — Recursively rewrites a compiled condition object: strips `UNSTORED_FIELDS`, applies `coerce`, recurses into `$or`/`$and` arrays.
- **`collapse`** — Simplifies the top-level `$or`: if any branch is an empty object (matches everything) the whole filter becomes `{}`; if only one branch remains, the `$or` wrapper is removed.
- **`matchesEverything`** — Small helper: `true` when a branch object has zero own keys.

## Relationships

- **`src/kernel/ability.ts`** — Provides `buildAbility`, which `accessibleFilter` calls to construct the ability instance from a resolved caller.
- **`src/kernel/permissions.ts`** — Provides `callerForSubject` and `anonymousCaller`, used to determine _which_ rules apply to the current context and subject.
- **`src/types/auth-context.ts` / `src/types/index.ts`** — Source of the `AuthContext` type that `accessibleFilter` accepts as its first argument.
- **`src/modules/orders/services/scope.ts`, `src/modules/payments/services/scope.ts`, `src/modules/products/service.ts`, `src/modules/locales/services/capabilities.ts`** — Consumer modules in the same dependency graph; they are the call sites that previously maintained their own filter fragments and now rely on this kernel function.
- **`tests/unit/kernel/access-query.test.ts`** — Unit test covering the compilation, coercion, and collapse behaviour.

## Notes

- **Fails closed by design.** When no rule matches, `@casl/mongoose` emits `EMPTY_RESULT_QUERY` (a filter matching zero documents). The function never returns `undefined`; "no rules" is deliberately distinguishable from "no conditions" (`{}`).
- **Spread, don't assign.** The return value is a fragment. An unrestricted caller gets `{}`, not `undefined`, so downstream code should always spread it: `{ ...accessibleFilter(ctx, 'Order'), status: 'paid' }`.
- **`UNSTORED_FIELDS` is not the tenancy toggle.** The docstring explicitly warns that emptying this set scopes only a minority of reads while leaving the rest unscoped. Real pooled-tenancy work is described in `docs/theory/tenancy.md §10`.
- **`userId` coercion is load-bearing.** Without the string→ObjectId cast the filter silently matches nothing — a "hidden everything" failure that is indistinguishable from a correct restriction in logs.
