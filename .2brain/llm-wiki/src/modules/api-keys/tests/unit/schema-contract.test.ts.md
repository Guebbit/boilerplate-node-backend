---
source: src/modules/api-keys/tests/unit/schema-contract.test.ts
sha256: 3e3ea8834106105a048dad0418313863ef71e0410020f69c2f303633ae686a81
generated_at: 2026-09-23T18:26:13.009588+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/unit/schema-contract.test.ts

## Purpose

Unit test that pins the **declarative contract** of `apiKeySchema` — which fields are `required`, which indexes exist with which options, and which fields are intentionally _absent_ (lifecycle timestamps). It exists because integration tests that only insert valid documents cannot catch a silently dropped `required`, a `unique` constraint removed from `publicPrefix`, or a new index sneaking in; this file asserts the schema's shape in isolation.

## Key elements

- **`describe('apiKeySchema')`** — single block with six assertions covering:
    - **Required fields** — `requiredPaths` must be exactly `[createdByUserId, hash, name, permissions, publicPrefix, tenant]`.
    - **Lifecycle field absence** — `lastUsedAt`, `expiresAt`, `revokedAt` must **not** appear in required paths (their absence is semantically meaningful: "never used / no expiry / never revoked").
    - **`publicPrefix` unique index** — `indexOptionSpecs` must include `publicPrefix_1: unique=true`, making prefix lookup an exact match.
    - **Exact index set** — `indexSpecs` must be exactly the two indexes `publicPrefix_1` and `tenant_1_createdAt_-1`; nothing more.
    - **No TTL / sparse options** — the tenant+createdAt index carries `(none)`.
    - **`timestamps` option** — `optionsOf(...).timestamps` must be `true` (enables `createdAt`/`updatedAt`, the latter used by the tenant listing sort).

## Relationships

- **`src/modules/api-keys/model.ts`** — exports `apiKeySchema`, the Mongoose schema under test. Every assertion in this file introspects that object.
- **`tests/support/schema.ts`** — exports the schema-introspection helpers used here: `requiredPaths`, `indexSpecs`, `indexOptionSpecs`, `optionsOf`. These flatten Mongoose schema internals into comparable strings/arrays.

## Notes

- The module docstring explicitly contrasts this file with integration tests: a valid-document round-trip will never fail if a `required` is dropped or a `unique` is lost, so only a contract-level assertion catches that drift.
- Index assertions use `toEqual` (exact set match) rather than `toContain`, so adding or removing an index is immediately a test failure.
- The lifecycle-field test is deliberately a _negative_ check (not in required paths) rather than asserting they are `optional: true`; the intent is that the fields simply don't exist until a lifecycle event fires.
