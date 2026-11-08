---
source: src/modules/account/tests/unit/auth-schemas.test.ts
sha256: 71e2362817265f2d6c208b8dd51019221de43dfde94081bc5fdba6ed92aade6e
generated_at: 2026-11-08T04:45:28.112913+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/auth-schemas.test.ts

## Purpose

Unit tests that assert the declared Mongoose schema shapes for `sessionSchema` and `verificationTokenSchema`—required fields, enum constraints, index behaviour (unique, TTL, partial-unique), and serialization safety—without touching a database. They exist so that silently dropped or altered index declarations (which would only surface as production data corruption) are caught at commit time.

## Key elements

- **`describe('sessionSchema')`** — asserts:
  - Required paths (`expiresAt`, `familyId`, `mode`, `purgeAt`, `startedAt`, `tokenHash`, `userId`).
  - `mode` is an enum of `['jwt', 'cookie']`.
  - `tokenHash` carries `unique: true`.
  - A TTL index on `purgeAt` (`expireAfterSeconds: 0`).
  - The full index set: `purgeAt`, `tokenHash`, `userId + familyId`.
  - `timestamps` is `false` (dates are set explicitly by application code).
  - `tokenHash` is excluded from `toJSON()` output (serialisation guard).
- **`describe('verificationTokenSchema')`** — asserts:
  - Required paths (`expiresAt`, `sentAt`, `tokenHash`, `type`, `userId`).
  - `type` is an enum over `VERIFICATION_TOKEN_TYPES`.
  - `tokenHash` is unique.
  - A TTL index on `expiresAt`.
  - A **partial unique** index on `(userId, type)` whose `partialFilterExpression` restricts uniqueness to `ONE_LIVE_TOKEN_TYPES`; the complement (`mfa-challenge`, `deletion-restore`) may have multiple live rows.
  - `tokenHash` is excluded from `toJSON()` output.
- **Schema-inspection helpers** (imported from `@tests/schema`): `requiredPaths`, `enumOf`, `pathOptions`, `indexBehaviour`, `indexSpecs`, `optionsOf` — all read properties off the schema object in-memory.

## Relationships

- **`src/modules/account/model.ts`** — source of `sessionSchema`, `verificationTokenSchema`, `sessionModel`, and `verificationTokenModel`. The tests read schema metadata and instantiate models to verify serialisation exclusion.
- **`src/modules/account/token-types.ts`** — supplies the `VERIFICATION_TOKEN_TYPES` and `ONE_LIVE_TOKEN_TYPES` arrays that the tests compare against for the enum and partial-index assertions.
- **`tests/support/schema.ts`** — provides the six helper functions that extract and normalise schema properties (paths, enums, index specs, path options, schema options) so tests stay declarative rather than reaching into Mongoose internals.

## Notes

- No database connection or running MongoDB is required; every assertion reads off the in-memory schema object or a freshly constructed (unsaved) model instance.
- The serialisation tests use `Types.ObjectId` to satisfy Mongoose's type check without a real DB.
- The partial-unique-index test also asserts the **complement** of `ONE_LIVE_TOKEN_TYPES`, pinning the exact set of "multi-instance" kinds (`mfa-challenge`, `deletion-restore`) to prevent accidental additions.
- `sessionSchema` explicitly sets `timestamps: false`; if a future refactor re-enables Mongoose timestamps, the `requiredPaths` test will still pass (Mongoose adds `_createdAt`/`_updatedAt` as optional), so the dedicated `optionsOf` check is the real guard.
