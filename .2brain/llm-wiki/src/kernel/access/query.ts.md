---
source: src/kernel/access/query.ts
sha256: a2a9d18e6c017b643c15350b5d9e968e40030f9422a9e83eafde476cecf2c01b
generated_at: 2026-11-08T03:52:21.207527+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/access/query.ts

## Purpose

Compiles a caller's CASL rules into a MongoDB filter so that the access restriction is embedded in the read query itself. It is the kernel's single store-specific authorization-compile step (the other being `../outbox.ts`), replacing per-module hand-written filter fragments with one guarantee: a key that grants more returns more, and no caller can accidentally omit the restriction.

## Key elements

- **`accessibleFilterFor(caller, subject, action?)`** — Primary entry point. Builds a CASL ability from the resolved `Caller`, runs `accessibleBy(...).ofType(subject)`, then passes the raw compile output through `toStorage` → `collapse`. Returns a Mongo filter fragment (possibly `{}`).
- **`accessibleFilter(context, subject, action?)`** — Session-oriented wrapper. Resolves `AuthContext` to a `Caller` via `callerForSubject`, then delegates to `accessibleFilterFor`. Intended to be **spread** into a larger query, not used as a standalone filter.
- **`hasAnonymousReadScope(scopeOf, who)`** — Compares a module's own compiled filter for `who` against its filter for `undefined` (anonymous) by serialising both. Used by cache-key logic to decide whether a caller can share the guest's cached response.
- **`toStorage(query)`** — Recursive rewriter: drops fields in `UNSTORED_FIELDS`, applies the `coerce` map (currently `userId` → ObjectId), and recurses into `$or`/`$and` arrays.
- **`collapse(filter)`** — Post-simplification: an `$or` containing an empty branch collapses to `{}`; a single-branch `$or` unwraps to that branch.
- **`UNSTORED_FIELDS`** — Set (`{'tenantId'}`) of rule fields absent from this deployment's collections. Stripped so the model can remain tenant-aware without locking out single-tenant shops.
- **`NO_OWNER` / `ownerObjectId(value)`** — Sentinel ObjectId and a string→ObjectId guard; non-24-hex IDs map to `NO_OWNER` so the rule matches nothing (fail closed) rather than throwing.
- **`coerce`** — Field-level value coercion map (currently only `userId`).

## Relationships

- **`src/kernel/ability.ts`** — Provides `buildAbility`, which this file calls to obtain the CASL ability instance before compiling.
- **`src/kernel/permissions.ts`** — Source of `anonymousCaller`, `callerForSubject`, and the `PermissionAction` / `PermissionSubject` types used throughout.
- **`src/modules/products/services/read.ts`**, **`src/modules/products/routes.ts`** — Consumers that spread `accessibleFilter` / `accessibleFilterFor` into product-collection reads.
- **`src/modules/orders/services/scope.ts`**, **`src/modules/payments/services/scope.ts`** — Provide the `scopeOf` callback passed to `hasAnonymousReadScope` for cache-key decisions.
- **`src/modules/locales/*`**, **`src/modules/example/services/*`** — Downstream module services that use the same compile-into-query pattern via this file's exports.
- **`src/modules/products/tests/integration/api-key-reads.test.ts`** — Exercises the API-key path through `accessibleFilterFor` to verify key-granted permissions produce the expected row set.

## Notes

- **Fails closed by design.** A caller with no matching rule compiles to CASL's `EMPTY_RESULT_QUERY` (a filter matching nothing), never to an absent filter. An absent filter is indistinguishable from "unrestricted" to every downstream caller.
- **`accessibleFilter` returns `{}` for unrestricted callers, not `undefined`.** Spread it (`{ ...accessibleFilter(ctx, 'Order'), status: 'paid' }`); do not assign it to a query variable and conditionally spread, since `{}` and `undefined` must not look alike.
- **`UNSTORED_FIELDS` is not the tenancy switch.** Emptying it removes the `tenantId` condition from the compiled query, but most collections carry no organisation column and most modules never compile a scoped filter at all. True multi-tenant isolation requires the broader checklist in `docs/theory/tenancy.md` §10.
- **`coerce` is intentionally minimal.** Adding a field here is the only way to handle a type mismatch between the rule's value and the stored representation. Forgetting an entry produces a silent zero-row match (string vs. ObjectId), which looks like "caller has no access" rather than "caller has access to everything."
- **The file is Mongo-only.** Do not import it from code paths that target a non-Mongo store; it has no abstraction over the query shape.
