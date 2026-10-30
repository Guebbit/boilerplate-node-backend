---
source: src/kernel/access/query.ts
sha256: ac422a59ef756cef8000ead5634ea1343ba75437b9c7202bed560cfa4206d053
generated_at: 2026-10-29T02:18:21.977201+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/access/query.ts

## Purpose

Compiles a caller's CASL authorization rules into a ready-to-use MongoDB filter via `@casl/mongoose`, so that every read query is scoped by construction rather than by each module remembering to apply a filter. It is the kernel's sole store-specific authorization file (alongside `../outbox.ts`) and exists so that "the restriction rides in the read" is a library guarantee, not a per-module convention.

## Key elements

- **`accessibleFilter(context, subject, action?)`** — Primary entry point for modules that hold an `AuthContext`. Resolves the caller via `callerForSubject`, delegates to `accessibleFilterFor`. Returns a **filter fragment** (spread it into the query); an unrestricted caller gets `{}`, not `undefined`.
- **`accessibleFilterFor(caller, subject, action?)`** — Same logic but accepts an already-resolved `Caller` (e.g. `request.caller` from an API key). Compiles rules with `accessibleBy(buildAbility(caller ?? anonymousCaller()), action).ofType(subject)`, then runs the result through `toStorage` → `collapse`.
- **`hasAnonymousReadScope(scopeOf, who?)`** — Compares a caller's compiled filter against the anonymous filter by JSON equality. Designed for `infrastructure/http/middlewares/cache.ts`'s `scopeKey` so a caller with the same visibility as a guest can safely share a cached response.
- **`UNSTORED_FIELDS`** (`Set: ['tenantId']`) — Strips rule fields that this deployment's collections do not store, preventing a filter that would match zero rows.
- **`toStorage(query)`** — Recursively rewrites a CASL-compiled condition: drops `UNSTORED_FIELDS` entries, coerces `userId` strings to `Types.ObjectId`, and recurses into `$or`/`$and` arrays.
- **`ownerObjectId(value)`** — Safe cast: valid 24-hex strings become `ObjectId`, anything else becomes a sentinel `NO_OWNER` (all-zeros) that matches no row.
- **`collapse(filter)`** — Simplifies degenerate `$or` shapes produced after stripping: an `$or` containing a `{}` branch collapses to `{}`; a single-branch `$or` unwraps to that branch.
- **`coerce`** — Map of field-name → value coercion applied inside `toStorage` (currently only `userId`).

## Relationships

- **`src/kernel/ability.ts`** — Imports `buildAbility`, which turns a `Caller` into the CASL ability object that `accessibleBy` compiles.
- **`src/kernel/permissions.ts`** — Imports `anonymousCaller` (the zero-permission fallback) and `callerForSubject` (resolves an `AuthContext` to a `Caller` for a given subject).
- **`src/modules/orders/services/scope.ts`**, **`src/modules/payments/services/scope.ts`**, **`src/modules/products/services/read.ts`**, **`src/modules/locales/services/actions.ts`**, **`src/modules/locales/services/capabilities.ts`** — Consumer modules that call `accessibleFilter` / `accessibleFilterFor` to scope their read queries.
- **`src/modules/products/tests/integration/api-key-reads.test.ts`** — Integration test exercising the API-key path through `accessibleFilterFor`.
- **`src/modules/locales/routes.ts`**, **`src/modules/products/routes.ts`**, **`src/modules/example/services/cover.ts`**, **`src/modules/example/services/crud.ts`**, **`src/modules/example/services/transition.ts`** — Route/service layers that pass `request.caller` or session context into the filter functions.

## Notes

- **Spread, don't assign.** `accessibleFilter` returns a fragment. An unrestricted caller yields `{}`, which is distinguishable from a missing filter (`undefined`). Treating the two as equivalent is a bug the codebase explicitly guards against.
- **Fails closed.** No matching rule → CASL's `EMPTY_RESULT_QUERY` (matches nothing). A non-ObjectId caller id → `NO_OWNER` sentinel. The code never produces a missing/empty filter that downstream callers would read as "unrestricted."
- **`UNSTORED_FIELDS` is not a tenancy switch.** Emptying it scopes only the reads that happen to carry a `tenantId` condition; most collections and modules are unaffected. True pooled-vs-tenant isolation is a larger change (see `docs/theory/tenancy.md §10`).
- **`hasAnonymousReadScope`** takes the module's own `scopeOf` function as a parameter rather than hardcoding a subject name, so it stays correct if the module's rule shape changes.
- **`toStorage` is recursive** because CASL emits `$or`/`$and` arrays when a caller holds multiple rules for one subject; every branch needs the same field-dropping and coercion treatment.
