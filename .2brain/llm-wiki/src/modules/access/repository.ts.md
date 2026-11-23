---
source: src/modules/access/repository.ts
source_sha256: f333f4051010ac24e09e731712dba87723119e39c12bceb8523a6eebb78494d0
context_sha256: 772f6bd68a3823d9f60833cd04e0495d5e7690441bb09880e55b9a13f2d12968
generated_at: 2026-11-22T03:17:00.819591+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/access/repository.ts

## Purpose
The single data-access layer for the tenant and membership collections. It only shapes queries; the module header states that every invariant lives in `./services/`. It exposes two plain-object repositories that wrap the Mongoose models.

## Key elements
- **`tenantRepository.upsertBySlug(slug, name, id?)`**: create-or-return a tenant keyed on `slug`. It uses `$setOnInsert` only, so an existing tenant keeps its `slug`, `name` and `_id`. The optional `id` is applied as `_id` only on insert, so a fixed id survives reseeds. It always resolves a document.
- **`membershipRepository.findByUserId(userId)`**: all memberships a user holds.
- **`membershipRepository.findOne(userId, tenantId, scope)`**: one membership, or `null`.
- **`membershipRepository.upsertRole(userId, tenantId, scope, role, session?)`**: create-or-overwrite the role (`$set`) for a user in one place. It always resolves a document and can join a transaction.
- **`membershipRepository.deleteById(id, session?)`**: delete one row by `_id`. It can join a transaction.
- **`membershipRepository.deleteByUserId(userId, session?)`**: delete all of a user's rows (`deleteMany`). The source comment names the hard-delete cascade as its use. It can join a transaction.
- **`membershipRepository.findByUserIds(userIds, tenantId, scope)`**: the batched version of `findOne`, using `$in`.
- **`membershipRepository.findUserIdsByRoles(tenantId, roles)`**: `distinct('userId')` for memberships with `scope: 'tenant'` and a role in `roles`. The source comment says it is served by the `{ tenantId, role }` index.

## Relationships
- **`src/modules/access/model.ts`**: supplies `tenantModel` and `membershipModel` (the Mongoose models queried here) and the `TenantDocument` / `MembershipDocument` types.
- **`src/types/index.ts`**: provides the `AuthorizationScope` type (imported via `@types`) used in the membership query signatures.
- **`src/modules/access/services/memberships.ts`**: the module header says `./services/` carries the invariants. The session parameters are documented as joining the caller's account create/update transactions and the hard-delete cascade.
- **`src/modules/access/tests/factories.ts`** and **`src/modules/access/tests/integration/access.test.ts`**: listed as graph neighbors; the file content shows no direct interaction with them.

## Notes
- `tenantId` is `string | null` in the membership queries, and `null` is a valid value in those filters.
- Transaction participation is opt-in. Writes only use a transaction if the caller passes a `ClientSession`.
- `findUserIdsByRoles` hardcodes `scope: 'tenant'` and takes a non-null `tenantId`.
- `deleteById` and `deleteByUserId` return `{ deletedCount?: number }`.
