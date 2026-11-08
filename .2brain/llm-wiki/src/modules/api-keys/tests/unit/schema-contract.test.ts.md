---
source: src/modules/api-keys/tests/unit/schema-contract.test.ts
sha256: ce3afe9944fb9ba0ec89b2bb228870a6207ae99678a5fd3518d6bb0d4082fe0f
generated_at: 2026-11-08T05:07:10.416889+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/unit/schema-contract.test.ts

## Purpose

Validates the structural contract of `apiKeySchema`—required fields, index declarations, and index options—because these are schema-level declarations that no valid-document integration test can observe. A dropped `required` flag or a detached `unique` constraint silently changes lookup semantics without ever causing a valid fixture to fail.

## Key elements

- **`requiredPaths` check** — asserts the exact set of required paths: `createdByUserId`, `expiresAt`, `hash`, `name`, `permissions`, `publicPrefix`, `tenant`.
- **Lifecycle-field absence check** — asserts `lastUsedAt` and `revokedAt` are *not* required, so their absence means "never used" / "never revoked" rather than a `default` masking a fresh credential.
- **Unique-index check** — asserts `publicPrefix_1` carries `unique=true`, which makes `findActiveByPrefix` an exact lookup.
- **Exact index-set check** — asserts the schema declares *only* `publicPrefix_1` and `tenant_1_createdAt_-1` and nothing else.
- **Index-options check** — asserts no TTL or sparse option is set on either index.
- **Timestamps check** — asserts `timestamps: true` is enabled (tenant listing sorts by `createdAt`).

## Relationships

- **`src/modules/api-keys/model.ts`** — imports `apiKeySchema`, the single object under test.
- **`tests/support/schema.ts`** — provides the inspection helpers (`requiredPaths`, `indexSpecs`, `indexOptionSpecs`, `optionsOf`) that serialize Mongoose schema internals into comparable strings.

## Notes

- Follows the same convention as every other module's `schema-contract.test.ts` (e.g. `webhooks`); the module doc comment cross-references them.
- `expiresAt` is required while `lastUsedAt`/`revokedAt` are optional—this asymmetry is intentional and semantically load-bearing, not an oversight.
- Tests compare *serialized* strings (e.g. `'publicPrefix_1: unique=true'`), so adding or removing an index or option will fail the exact-set assertions rather than a subset check.
