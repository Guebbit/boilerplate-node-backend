---
source: src/modules/api-keys/tests/unit/schema-contract.test.ts
source_sha256: 615ec68b08fe4229d52a39e8097efaa030628342f13302767976893817de32d0
context_sha256: 4af323f85bd1f4580d9157c635d2f21b3172e1f748bae75cb3b278ef113c6c94
generated_at: 2026-11-22T04:25:59.180790+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/api-keys/tests/unit/schema-contract.test.ts

## Purpose
Unit test that pins the declared contract of `apiKeySchema`: which paths are required, which indexes exist and with what options, and which schema options are set. It exists because a dropped `required` or a detached `unique` doesn't change what a valid document looks like, so integration tests that only save valid fixtures can't catch it. It follows the same pattern as other modules' `schema-contract.test.ts`.

## Key elements
- `describe('apiKeySchema')` with six tests:
  - **Required paths**: exactly `createdByUserId`, `expiresAt`, `hash`, `name`, `permissions`, `publicPrefix`, `tenant`.
  - **Lifecycle fields**: `lastUsedAt` and `revokedAt` must not be required. Their absence carries meaning (never used or never revoked), so a `default` would misreport a fresh credential.
  - **Prefix uniqueness**: the `publicPrefix_1` index has `unique=true`. This is what makes `findActiveByPrefix` an exact lookup.
  - **Index set**: exactly `publicPrefix_1` and `tenant_1_createdAt_-1` (tenant ascending, createdAt descending).
  - **Index options**: `publicPrefix_1` has only `unique=true`, and the tenant listing index has `(none)`. No TTL or sparse option on either.
  - **Timestamps**: `timestamps` is `true`, because the tenant listing sorts by `createdAt` and `updatedAt`.

## Relationships
- Imports `apiKeySchema` from `src/modules/api-keys/model.ts`, the schema under test.
- Uses `requiredPaths`, `indexSpecs`, `indexOptionSpecs` and `optionsOf` from `tests/support/schema.ts` (imported through the `@tests/schema` alias) to turn the schema into comparable strings and arrays.

## Notes
- Assertions on required paths and index specs use exact `toEqual`, so adding a field or index to the model requires updating this test.
- The required-paths list is expected in alphabetical order.
- The index spec strings use the format `name: field+1, field-1`, and the option strings use `name: key=value` or `name: (none)`.
