---
source: src/modules/access/repository.ts
sha256: e2734364bc2d4d71bb6dd3494982afdd99c1dc95eb8fa95803708580d8f05da3
generated_at: 2026-10-14T08:26:25.382242+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/repository.ts

## Purpose

Thin data-access layer over the `tenants` and `memberships` Mongoose collections. It shapes queries only; all authorization invariants and business rules live in `./service.ts`. Exists so the service layer never touches Mongoose directly.

## Key elements

- **`tenantRepository.upsertBySlug(slug, name, id?)`** — `findOneAndUpdate` with `$setOnInsert` + `upsert`. Creates the tenant on first sight or returns the existing one. An explicit `_id` is set only on insert, so reseeds are idempotent. Always resolves a `TenantDocument` (never `null`).
- **`membershipRepository.findByUserId(userId)`** — All membership rows for a user across every tenant/scope.
- **`membershipRepository.findOne(userId, tenantId, scope)`** — Single membership lookup; resolves `null` when no row exists.
- **`membershipRepository.upsertRole(userId, tenantId, scope, role, session?)`** — Create-or-overwrite a user's role in a given scope. Accepts an optional `ClientSession` for transactional writes. Always resolves a document.
- **`membershipRepository.deleteById(id)`** — Delete one membership row by `_id`.
- **`membershipRepository.deleteByUserId(userId, session?)`** — Cascade-delete all rows for a user. Accepts an optional `ClientSession`.
- **`membershipRepository.findByUserIds(userIds, tenantId, scope)`** — Batched multi-user lookup in a single tenant/scope (batch sibling of `findOne`).

## Relationships

- **`src/modules/access/model.ts`** — Source of `tenantModel`, `membershipModel`, and the `TenantDocument` / `MembershipDocument` types used here.
- **`src/modules/access/service.ts`** — Primary consumer. The module doc comment states the service "carries every invariant"; this repository is the query-shaping layer it delegates to.
- **`src/types/index.ts`** — Provides the `AuthorizationScope` type (imported as `from '@types'`) used in membership query parameters.
- **`src/modules/access/tests/integration/access.test.ts`** — Integration test that exercises the repository through the service layer.

## Notes

- Every `upsert` method (`upsertBySlug`, `upsertRole`) combines `upsert: true` with `returnDocument: 'after'`, guaranteeing a non-null document. A caller can therefore skip null-checks on those return values.
- `upsertBySlug` uses `$setOnInsert` exclusively: re-calling with different `name` or `id` values will **not** mutate an existing tenant.
- The two `session?` parameters (`upsertRole`, `deleteByUserId`) join the write/delete to the caller's Mongoose transaction (e.g., an account create/update or hard-delete cascade). Passing them is the service's responsibility, not the repository's.
- `deleteById` and `deleteByUserId` return Mongoose's `{ deletedCount }` shape, not a boolean — check `deletedCount > 0` if you need existence confirmation.
