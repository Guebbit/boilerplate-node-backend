---
source: src/modules/access/repository.ts
sha256: c939d592be4f6c05b76bca72c9bfc4cd3689ca18033a46f50474554d91b6680f
generated_at: 2026-09-23T17:57:32.188199+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/repository.ts

## Purpose

The sole query-shaping layer for the tenant and membership collections. All authorization invariants live in `./service.ts`; this file only translates intent into Mongoose operations, giving the service a narrow, predictable API surface.

## Key elements

- **`tenantRepository`** – single-method object exposing the tenant collection's only write path.
    - `upsertBySlug(slug, name, id?)` – `findOneAndUpdate` with `$setOnInsert`; creates a tenant on first sight, returns the existing one on subsequent calls. `id` is honored only at insert time, so reseeding with a fixed ObjectId is idempotent.
- **`membershipRepository`** – read/write object for the membership collection.
    - `findByUserId(userId)` – all roles a person holds, across every scope.
    - `findOne(userId, tenantId, scope)` – the single membership row for a person in a specific place/scope; returns `null` when absent.
    - `upsertRole(userId, tenantId, scope, role)` – create-or-overwrite a role assignment; always resolves a document.
    - `deleteById(id)` – removes one membership row by its `_id`.
    - `findByUserIds(userIds, tenantId, scope)` – batched version of `findOne`; returns all rows for a set of users in one place.

## Relationships

- **`./model.ts`** – imports `tenantModel`, `membershipModel` (Mongoose models) and the `TenantDocument` / `MembershipDocument` types.
- **`./service.ts`** – the caller; service enforces invariants then delegates raw queries here.
- **`src/types/index.ts`** (`@types`) – source of the `AuthorizationScope` type used in every membership query.
- **`src/modules/access/tests/integration/access.test.ts`** – integration tests exercise both repository objects end-to-end.

## Notes

- `tenantId` is typed `string | null` throughout the membership methods; `null` represents a non-tenant (e.g. workspace-level) scope. Do not omit it—passing `undefined` would match differently in MongoDB.
- Both upsert methods cast the Mongoose result to the non-null document type. This is safe because `upsert: true` + `returnDocument: 'after'` guarantee a returned document, but the cast is necessary to silence Mongoose's `T | null` signature.
- `upsertBySlug` intentionally uses `$setOnInsert` rather than `$set`/`$setOnUpdate`; passing a different `name` on a repeat call will **not** rename an existing tenant.
