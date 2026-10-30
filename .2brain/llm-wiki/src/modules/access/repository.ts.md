---
source: src/modules/access/repository.ts
sha256: 1173eef7d019a4070f2b2fbebf25cdd18c244125625db19e465266927b9398e8
generated_at: 2026-10-29T02:22:41.480340+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/repository.ts

## Purpose

Data-access layer for the **tenant** and **membership** Mongoose collections. It contains only query shaping (filters, update operators, transaction-session pass-through); all business invariants live in `./services/`. Callers in the services layer are the sole consumers.

## Key elements

- **`tenantRepository`** — single-method object wrapping the tenant collection.
  - `upsertBySlug(slug, name, id?)` — `findOneAndUpdate` with `$setOnInsert` + `upsert`. Existing tenants are never mutated (slug, name, `_id` are write-once). Always resolves a document, never `null`.

- **`membershipRepository`** — object covering all membership reads/writes.
  - `findByUserId(userId)` — all rows for one person.
  - `findOne(userId, tenantId, scope)` — a single person's role in one place; may return `null`.
  - `upsertRole(userId, tenantId, scope, role, session?)` — create-or-overwrite a role row. Accepts a Mongoose `ClientSession` to join the caller's transaction.
  - `deleteById(id, session?)` — remove one row by `_id`.
  - `deleteByUserId(userId, session?)` — cascade-delete all rows for a person.
  - `findByUserIds(userIds, tenantId, scope)` — batched sibling of `findOne` using `$in`.
  - `findUserIdsByRoles(tenantId, roles)` — `distinct('userId')` for people holding any of the given roles; hard-codes `scope: 'tenant'`; backed by the `{ tenantId, role }` index.

## Relationships

- **`src/modules/access/model.ts`** — source of `tenantModel`, `membershipModel` and the `TenantDocument` / `MembershipDocument` types used as return types.
- **`src/modules/access/services/memberships.ts`** — primary caller; the module doc-block explicitly delegates all invariants to the services directory.
- **`src/types/auth-context.ts` / `src/types/index.ts`** — provides the `AuthorizationScope` type (imported via the `@types` alias → `src/types/index.ts`).
- **`src/modules/access/tests/factories.ts`** and **`src/modules/access/tests/integration/access.test.ts`** — test fixtures and integration suites that exercise these repository methods directly.

## Notes

- Both repositories are **plain objects**, not classes; there is no shared base or interface.
- `tenantId` is typed `string | null` across membership methods — a `null` tenantId is a valid, queryable value (shop-level vs. global scope).
- `upsertRole` and the delete methods accept an optional `session: ClientSession` for transactional consistency with account create/update flows; `findBy*` methods do not.
- `findUserIdsByRoles` hard-codes `scope: 'tenant'`; it is not a generic multi-scope query.
- The `id` parameter on `upsertBySlug` is only applied on insert (`$setOnInsert`), so passing a fixed id across reseed runs is safe and idempotent.
