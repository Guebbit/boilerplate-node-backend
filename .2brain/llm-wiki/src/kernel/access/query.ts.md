---
source: src/kernel/access/query.ts
sha256: 79e4445839a5588249216923ed4a902392b5e7b70b4d2d0747553e7ecb3687bd
generated_at: 2026-10-14T08:20:36.609152+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/access/query.ts

## Purpose

Compiles a caller's CASL rules into a MongoDB filter so that the authorization restriction is embedded in the read query itself, rather than being a convention each module must independently remember. This is the kernel's sole store-specific authorization file (the other is `outbox.ts`), and it guarantees fail-closed behaviour: when no rule matches, the result is CASL's `EMPTY_RESULT_QUERY` (matches nothing), never an absent filter that downstream code would interpret as "unrestricted."

## Key elements

- **`accessibleFilter(context, subject, action?)`** — Primary export. Takes a resolved `AuthContext` (or `undefined` for anonymous), resolves the caller via `callerForSubject`, and returns a MongoDB filter fragment. Intended to be **spread** into a query, not used as a standalone query.
- **`accessibleFilterFor(caller, subject, action?)`** — Same as above but accepts an already-resolved `Caller` directly (used by routes reachable by both sessions and API keys).
- **`hasAnonymousReadScope(scopeOf, who)`** — Returns `true` when a caller's compiled filter is identical to the anonymous filter, by JSON-comparing the outputs of a module-supplied `scopeOf` function. Designed for cache-key logic so that a role change that widens visibility automatically invalidates sharing.
- **`UNSTORED_FIELDS`** (private) — Set of rule fields that have no corresponding column in this deployment's collections (currently `tenantId`). `toStorage` strips them before the query hits Mongo.
- **`coerce`** (private) — Per-field value coercion applied during query construction (currently `userId` string → `Types.ObjectId`).
- **`toStorage`** (private) — Recursively rewrites a CASL-compiled query object: strips `UNSTORED_FIELDS`, applies `coerce`, and descends into `$or`/`$and` arrays.
- **`collapse`** (private) — Simplifies degenerate `$or` expressions produced after stripping un-stored fields (e.g. a single-branch `$or` or an `$or` containing a match-everything `{}` branch).

## Relationships

- **`src/kernel/ability.ts`** — Provides `buildAbility`, which this file calls to obtain the CASL `IAbility` instance that `accessibleBy` compiles.
- **`src/kernel/permissions.ts`** — Provides `anonymousCaller` (the fallback identity) and `callerForSubject` (resolves an `AuthContext` into a `Caller` for a given subject).
- **`src/types/auth-context.ts` / `src/types/index.ts`** — Source of the `AuthContext` and `Caller` types consumed by the public API.
- **`src/modules/products/services/read.ts`, `src/modules/orders/services/scope.ts`, `src/modules/payments/services/scope.ts`, `src/modules/example/services/crud.ts`** — Module-level read/scope services that spread `accessibleFilter` into their collection queries.
- **`src/modules/products/routes.ts`, `src/modules/locales/routes.ts`** — Route handlers (reachable by both session and API key) that call `accessibleFilterFor` with `request.caller`.
- **`src/modules/locales/services/capabilities.ts`, `src/modules/example/services/cover.ts`** — Consumers of `hasAnonymousReadScope` for cache-key or capability checks.
- **`tests/unit/kernel/access-query.test.ts`** — Unit tests covering `toStorage`, `collapse`, coercion, and the public exports.
- **`src/modules/products/tests/integration/api-key-reads.test.ts`** — Integration test exercising the `accessibleFilterFor` (API-key) path end-to-end.

## Notes

- The filter returned by `accessibleFilter`/`accessibleFilterFor` is a **fragment**, not a complete query. An unrestricted caller gets `{}` (empty object), deliberately distinct from `undefined`, so "no conditions" and "no rules" are not conflated by callers.
- `UNSTORED_FIELDS` is **not** the tenancy switch. Emptying the set would only remove the `tenantId` condition from a minority of queries; most collections carry no organisation column and most modules never compile a scoped filter at all. True pooled tenancy requires the full list in `docs/theory/tenancy.md §10`.
- The `coerce` map exists because a string `userId` in a Mongo filter silently matches nothing (the collection stores ObjectIds). Without coercion the failure is "everything hidden," which is the opposite disguise of the missing-restriction bug.
- This file is explicitly Mongo-specific. It should not be imported from non-Mongo storage layers.
