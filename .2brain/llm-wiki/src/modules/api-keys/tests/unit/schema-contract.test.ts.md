---
source: src/modules/api-keys/tests/unit/schema-contract.test.ts
sha256: ce3afe9944fb9ba0ec89b2bb228870a6207ae99678a5fd3518d6bb0d4082fe0f
generated_at: 2026-10-15T10:21:32.527714+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/unit/schema-contract.test.ts

## Purpose

Contract tests that lock down the *declarative* metadata of `apiKeySchema` (required fields, index definitions, index options, timestamps). These assertions catch regressions that valid-document integration tests cannot: a silently dropped `required`, a lost `unique` on `publicPrefix`, or an extra index appearing.

## Key elements

- **`describe('apiKeySchema')`** — single test suite; no sub-suites.
- **`requiredPaths` assertion** — asserts the exact set of seven required fields (`createdByUserId`, `expiresAt`, `hash`, `name`, `permissions`, `publicPrefix`, `tenant`).
- **Lifecycle-absence assertions** — confirms `lastUsedAt` and `revokedAt` are *not* in the required set, preserving the semantic meaning of their absence on a fresh credential.
- **`indexOptionSpecs` / `indexSpecs` assertions** — pin the exact index list (unique on `publicPrefix`, composite `tenant+createdAt`) and their options (unique vs. none), preventing accidental extra indexes or TTL/sparse flags.
- **`optionsOf` timestamps check** — verifies `timestamps: true` so the tenant-listing sort keys exist.

## Relationships

- **`src/modules/api-keys/model.ts`** — source of `apiKeySchema`, the object under test. Every assertion in this file reads metadata from that Mongoose schema.
- **`tests/support/schema.ts`** — provides the shared introspection helpers (`requiredPaths`, `indexSpecs`, `indexOptionSpecs`, `optionsOf`) that extract schema metadata into flat, string-comparable form. This file does not define any of them.

## Notes

- Follows the repo-wide `schema-contract.test.ts` convention (see the module doc-comment referencing `webhooks`'s own). The intent is always "the declarations, not the documents."
- Index specs are asserted as an **exact** set (`toEqual`), not a subset, so any new index added to the model will fail this suite and force an explicit decision.
- The test that checks "no TTL or sparse option" is a guard against an implicit default in the schema library changing the effective index definition.
