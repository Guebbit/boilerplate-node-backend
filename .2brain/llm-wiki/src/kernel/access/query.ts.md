---
source: src/kernel/access/query.ts
sha256: 4a3d7c7ef06b2f225308d7acf4427c1325d5317792f6aeef479b68040351bbe5
generated_at: 2026-11-14T18:20:45.264029+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/access/query.ts

## Purpose

Compiles a caller's CASL permission rules into a ready-to-use MongoDB filter via `@casl/mongoose`, so that access restrictions are embedded directly in the database query. It is the kernel's single guarantee that "the restriction rides in the read," replacing per-module hand-written filter fragments that can silently drift from the rules.

## Key elements

- **`accessibleFilter(context, subject, action?)`** — Resolves an `AuthContext` to a `Caller` (via `callerForSubject`) and delegates to `accessibleFilterFor`. Returns a filter fragment to **spread** into a query; returns `{}` (not `undefined`) for an unrestricted caller.
- **`accessibleFilterFor(caller, subject, action?)`** — Builds a `Caller` ability, compiles it with `accessibleBy(...).ofType(subject)`, then post-processes the result through `toStorage` and `collapse`. Accepts `request.caller` directly, so API-key and session callers share the same path.
- **`hasAnonymousReadScope(scopeOf, who)`** — Compares a caller's compiled filter to the anonymous filter by `JSON.stringify` equality. Intended for cache-key logic: if the two filters are identical the caller may safely share a guest's cached response.
- **`UNSTORED_FIELDS`** — Set of rule fields the collection does not store (currently `tenantId`). `toStorage` silently drops them so tenant-aware model rules work against single-tenant collections without matching nothing.
- **`toStorage(query)`** — Recursively walks a compiled CASL query, stripping unstored fields and coercing values (e.g. `userId` string → `ObjectId`).
- **`collapse(filter)`** — Simplifies degenerate `$or` arrays: an empty branch (`{}`) collapses the whole filter to `{}`; a single branch unwraps the `$or`.
- **`ownerObjectId(value)` / `NO_OWNER`** — Maps a caller id string to an `ObjectId`, or to a zero-`ObjectId` sentinel for non-ObjectId ids (e.g. the literal `"system"` actor), ensuring fail-closed rather than a thrown cast.

## Relationships

- **`src/kernel/ability.ts`** — Imports `buildAbility`, which constructs the CASL ability from a `Caller` before `accessibleBy` compiles it.
- **`src/kernel/permissions.ts`** — Imports `anonymousCaller`, `callerForSubject`, and the `PermissionAction` / `PermissionSubject` types that parameterise every public export.
- **`src/infrastructure/persistence/create-repository.ts`** — Imports `isObjectIdString` to validate caller ids before constructing an `ObjectId`.
- **Module services** (`src/modules/orders/services/scope.ts`, `src/modules/payments/services/scope.ts`, `src/modules/products/services/actions.ts`, `src/modules/locales/services/capabilities.ts`, `src/modules/example/services/crud.ts`, etc.) — Consume `accessibleFilter` / `accessibleFilterFor` to obtain the row-scoped filter for their own queries, and `hasAnonymousReadScope` for cache-key decisions.

## Notes

- The returned filter is a **fragment**, not a whole query. Spread it: `{ ...accessibleFilter(ctx, 'Order'), status: 'paid' }`. Passing it as the entire query would break once you add conditions.
- An unrestricted caller yields `{}`, **not** `undefined`. Downstream code must not treat a falsy filter as "no restriction" — `{}` is the explicit "match everything" sentinel.
- Emptying `UNSTORED_FIELDS` is **not** the tenancy switch. It only stops `tenantId` from being compiled into filters; most collections have no organisation column and most modules never compile a scoped filter at all. See `docs/theory/tenancy.md` §10 for the real list of changes a pooled deployment requires.
- This is the kernel's one store-specific file (besides `../outbox.ts`); it assumes MongoDB and `@casl/mongoose`.
