---
source: src/kernel/access/query.ts
sha256: 64ba86bb88435cf3111b9963c39dff2491888c7da22ad56e5a89d646fd705f42
generated_at: 2026-09-27T14:17:58.611204+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/access/query.ts

## Purpose

Compiles a caller's CASL permission rules into a ready-to-spread MongoDB filter fragment, so that "the restriction rides in the read" is a library guarantee rather than a per-module convention. It centralizes the translation (rule → query) in one place, eliminating the silent drift that arises when each module maintains its own filter fragment alongside the rules.

## Key elements

- **`accessibleFilter(context, subject, action?)`** — Primary export. Resolves the caller, builds the ability, compiles it via `@casl/mongoose`'s `accessibleBy`, rewrites the result for storage, and collapses degenerate `$or` shapes. Returns a **filter fragment** (spread into the query), not a full query.
- **`hasAnonymousReadScope(scopeOf, context)`** — Exported helper for cache-key logic. Returns `true` when a caller's compiled filter is identical (by JSON equality) to the anonymous filter for the same subject, making cache-sharing safe by construction.
- **`UNSTORED_FIELDS`** — Set of rule fields that don't exist in this deployment's collections (currently only `tenantId`). Stripped during the rewrite so they don't produce a no-match filter.
- **`coerce`** — Per-field value transformers applied during the rewrite (e.g., `userId` string → `Types.ObjectId`).
- **`toStorage(query)`** — Recursive rewrite of a compiled condition: drops unstored fields, coerces values, recurses into `$or`/`$and` arrays.
- **`collapse(filter)`** — Post-rewrite simplification: if any `$or` branch is `{}`, the whole filter becomes `{}`; a single-branch `$or` is unwrapped.
- **`matchesEverything(branch)`** — Internal check for an empty-object branch.

## Relationships

- **`src/kernel/ability.ts`** — Imports `buildAbility`; provides the ability instance that `accessibleBy` compiles.
- **`src/kernel/permissions.ts`** — Imports `anonymousCaller` and `callerForSubject` to resolve the caller from the auth context.
- **`src/types/index.ts`** (via `@types`) — Supplies the `AuthContext` type used in both exports' signatures.
- **`src/modules/products/routes.ts`**, **`src/modules/products/service.ts`** — Consume `accessibleFilter` to scope product reads.
- **`src/modules/locales/routes.ts`**, **`src/modules/locales/services/capabilities.ts`** — Consume `accessibleFilter` and/or `hasAnonymousReadScope` for locale/capability reads.
- **`src/modules/orders/services/scope.ts`**, **`src/modules/payments/services/scope.ts`** — Provide module-specific `scopeOf` functions passed into `hasAnonymousReadScope` for cache-key scoping.
- **`tests/unit/kernel/access-query.test.ts`** — Unit tests covering the compile, rewrite, collapse, and anonymous-scope-comparison paths.

## Notes

- **Spread, don't assign.** `accessibleFilter` returns a fragment (`{}` for unrestricted, a condition object for scoped). Callers must spread it: `{ ...accessibleFilter(ctx, 'Order'), status: 'paid' }`. It is deliberately never `undefined`—`{}` and a missing filter are distinct states.
- **Fails closed.** A caller with no matching rule compiles to CASL's `EMPTY_RESULT_QUERY` (matches zero rows), not to a missing filter that downstream code might interpret as "unrestricted."
- **`UNSTORED_FIELDS` is not the tenancy switch.** Removing `tenantId` from the set scopes only the reads that go through this function. Most collections carry no organisation column and most modules never compile a scoped filter; emptying this set leaves the majority of reads unrestricted. Full tenancy pooling is documented in `docs/theory/tenancy.md §10`.
- **`hasAnonymousReadScope` compares by filter equality, not row probing.** A role change that widens visibility makes the two JSON-serialized filters unequal on its own, so no separate cache-invalidation step is needed.
- **`coerce` is intentionally minimal.** Currently only `userId` (string → `ObjectId`). Add a new coercion here if a rule field's type differs from the storage type; do not handle it per-module.
