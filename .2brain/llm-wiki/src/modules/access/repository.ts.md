---
source: src/modules/access/repository.ts
sha256: 72852b90ce51f5f94bbe12d17772b57b17b284b437857e06604974fab1bf70d9
generated_at: 2026-09-27T14:20:53.995432+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/repository.ts

## Purpose

Thin data-access layer that shapes Mongoose queries for the tenant and membership collections. It deliberately contains no business invariants—those live in `./service.ts`—so the repository is swappable and testable in isolation.

## Key elements

- **`tenantRepository`** – namespace object for the tenant collection.
  - `upsertBySlug(slug, name, id?)` – `findOneAndUpdate` with `$setOnInsert`; creates a tenant on first call, returns the existing one otherwise. A fixed `_id` survives reseeding because it is only set on insert.
- **`membershipRepository`** – namespace object for the membership collection.
  - `findByUserId(userId)` – all role rows a person holds across every scope/tenant.
  - `findOne(userId, tenantId, scope)` – a single row; resolves `null` if absent.
  - `upsertRole(userId, tenantId, scope, role)` – create-or-overwrite the role for a given (user, tenant, scope) triple.
  - `deleteById(id)` – removes one row by its `_id`.
  - `findByUserIds(userIds, tenantId, scope)` – batched sibling of `findOne`; returns all rows for a set of users in one scope.

## Relationships

- **`src/modules/access/model.ts`** – imports the two Mongoose models (`tenantModel`, `membershipModel`) and the document types (`TenantDocument`, `MembershipDocument`) that every method returns.
- **`src/modules/access/service.ts`** – sole consumer; the repository exposes raw query shapes, and the service layer enforces all authorization invariants before/after calling these methods.
- **`src/types/index.ts`** – provides the `AuthorizationScope` type used as a query filter in every membership method.
- **`src/modules/access/tests/integration/access.test.ts`** – integration tests that exercise these repository methods through the service.

## Notes

- Every `upsert` path (`upsertBySlug`, `upsertRole`) pairs `upsert: true` with `returnDocument: 'after'`, so the promise always resolves to a document and never `null`. Callers can skip null-checking on those two methods only.
- `tenantRepository.upsertBySlug` writes *only* on insert (`$setOnInsert`); a subsequent call with a different `name` or `id` will **not** mutate the existing tenant.
- `tenantId` is nullable in membership queries to support a global/organizational scope where no single tenant applies.
