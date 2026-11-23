---
source: src/kernel/access/query.ts
source_sha256: 9b7945bef94180e18d23ecb0fc7f420ff0252093a61ad565b1ddd77c19ca4f50
context_sha256: e41e9f45bff4ff66071746de1caee2877cf4960ec6e24b58041eabd87010cf47
generated_at: 2026-11-22T03:11:44.915311+00:00
model: claude-code:claude-sonnet-5-5
---

# src/kernel/access/query.ts

## Purpose
Turns a caller's authorization rules into the MongoDB filter that restricts a read, using `@casl/mongoose`. The same rules that the route guard reads are compiled into the query, so access restrictions are applied inside the read itself rather than hand-written per module. It fails closed: no matching rule yields CASL's `EMPTY_RESULT_QUERY` (matches nothing), never a missing filter.

## Key elements
- `accessibleFilterFor(caller, subject, action = 'read')` — builds the ability for a resolved `Caller` (or an anonymous one if `undefined`), compiles it with `accessibleBy(...).ofType(subject)`, rewrites it for storage with `toStorage`, and simplifies it with `collapse`. This is the entry point for routes reached by both sessions and API keys.
- `accessibleFilter(context, subject, action = 'read')` — the same, for a module that only sees a session (`AuthContext`). It resolves the caller via `callerForSubject` and delegates to `accessibleFilterFor`. The result is a fragment meant to be spread into a query. An unrestricted caller gets `{}`, not `undefined`.
- `hasAnonymousReadScope(scopeOf, who)` — returns true when the JSON-serialised compiled filter for `who` equals the one for anonymous. It compares filters rather than probing rows. It is built for the HTTP cache middleware's `scopeKey`, so callers who read the same rows as a guest can share the guest's cached response.
- `toStorage` (internal) — recursively rewrites the compiled query, including `$or`/`$and` branches. It drops `UNSTORED_FIELDS` and applies the `coerce` value converters.
- `UNSTORED_FIELDS` (internal) — currently only `tenantId`. The rules are tenant-aware, but this deployment's collections have no such field.
- `coerce` / `ownerObjectId` (internal) — converts a string `userId` into an `ObjectId`. A non-ObjectId id maps to the all-zero `NO_OWNER` id, so it matches no rows.
- `collapse` / `matchesEverything` (internal) — if any `$or` branch is `{}`, the whole filter becomes `{}`. A single-branch `$or` is unwrapped.

## Relationships
- `@kernel/ability` — `buildAbility` supplies the CASL ability that is compiled.
- `@kernel/permissions` — supplies `anonymousCaller`, `callerForSubject` and the `PermissionAction` and `PermissionSubject` types.
- `@infrastructure/persistence/create-repository` — `isObjectIdString` decides whether a `userId` can be cast to an `ObjectId`.
- Consumers include the module services (example `crud`, `cover` and `transition`; the `locales`, `orders`, `payments` and `products` services and routes). They call the filter functions to scope their reads, and `scope.ts` files in orders and payments serve as module-level `callerScope` functions.

## Notes
- Removing `UNSTORED_FIELDS` does not make a deployment multi-tenant. Most collections have no organisation column, most modules never compile a scoped filter, and the webhooks fan-out is unconditional.
- Leaving `userId` as a string would silently match nothing, which hides everything instead of showing everything.
- The file is the kernel's only Mongo-specific file besides `src/kernel/outbox.ts`.
- `collapse` exists for legibility, such as in slow-query logs. It does not change which rows are returned.
