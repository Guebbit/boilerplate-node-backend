---
source: src/modules/access/repository.ts
sha256: 1173eef7d019a4070f2b2fbebf25cdd18c244125625db19e465266927b9398e8
generated_at: 2026-11-08T03:57:01.487386+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/repository.ts

## Purpose

Data-access layer for the **tenant** and **membership** MongoDB collections. It exposes a small set of query and write primitives so that the service layer (`./services/`) can focus entirely on business invariants without repeating Mongoose boilerplate. No authorization checks or validation live here.

## Key elements

- **`tenantRepository`** — single export for the tenant collection.
  - `upsertBySlug(slug, name, id?)` — Create-or-return a tenant keyed on `slug`. Uses `$setOnInsert` so an existing tenant's `slug`, `name`, and `_id` are never overwritten. Returns a document (never `null`).

- **`membershipRepository`** — all reads and writes against the membership collection.
  - `findByUserId(userId)` — All role rows for one user across all places.
  - `findOne(userId, tenantId, scope)` — A single user's row in a specific scope/tenant, or `null`.
  - `upsertRole(userId, tenantId, scope, role, session?)` — Create-or-overwrite the role a user holds in one place. Accepts an optional Mongoose `ClientSession` to join the caller's transaction.
  - `deleteById(id, session?)` — Remove a single row by `_id`; transaction-aware.
  - `deleteByUserId(userId, session?)` — Cascade-delete every row for a user (hard-delete path); transaction-aware.
  - `findByUserIds(userIds, tenantId, scope)` — Batch fetch: all memberships for a set of users in one place.
  - `findUserIdsByRoles(tenantId, roles)` — `distinct('userId')` query restricted to `scope: 'tenant'`; returns the set of user ids holding any of the given roles. Served by the `{ tenantId, role }` compound index.

## Relationships

- **`src/modules/access/model.ts`** — Imports `membershipModel` and `tenantModel` (Mongoose models) plus the `MembershipDocument` / `TenantDocument` types used in every return signature.
- **`src/modules/access/services/memberships.ts`** — The primary caller; applies business invariants (e.g., role validation, scope rules) and then delegates the actual query/write to this file.
- **`src/types/index.ts`** — Provides the `AuthorizationScope` type that parameterises `findOne`, `upsertRole`, `findByUserIds`, and `findUserIdsByRoles`.
- **`src/modules/access/tests/factories.ts`** — Supplies test data shaped to these collections for use in integration tests.
- **`src/modules/access/tests/integration/access.test.ts`** — Exercises the repository methods end-to-end against a live MongoDB instance.

## Notes

- **`$setOnInsert` is deliberate.** `tenantRepository.upsertBySlug` will *never* mutate an existing tenant's fields. If a caller passes a different `name` or `id` for an already-present slug, the original document is returned unchanged.
- **`upsert: true` + `returnDocument: 'after'`** on both upsert paths guarantees a non-null return. A plain `findOneAndUpdate` without upsert could resolve `null`; this file avoids that ambiguity by construction.
- **Optional `session` parameters** (`ClientSession`) are the integration point for multi-document transactions (account create, account update, hard-delete cascade). Callers in the service layer are responsible for creating and passing the session.
- **`findUserIdsByRoles` hardcodes `scope: 'tenant'`.** It is not generalised to other scopes; callers must not expect it to work for, e.g., `scope: 'project'`.
