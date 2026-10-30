---
source: src/modules/account/tests/unit/auth-schemas.test.ts
sha256: 71e2362817265f2d6c208b8dd51019221de43dfde94081bc5fdba6ed92aade6e
generated_at: 2026-10-29T03:03:25.414306+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/auth-schemas.test.ts

## Purpose

Unit tests that validate the structural declarations of the `sessionSchema` and `verificationTokenSchema` Mongoose schemas by reading the schema objects in-memory — no database connection is required. Each assertion guards against a specific silent failure mode (dropped TTL index, lost unique constraint, open `type` enum, serialized digest).

## Key elements

- **`describe('sessionSchema')`** — verifies required paths (`userId`, `familyId`, `mode`, `tokenHash`, `startedAt`, `expiresAt`, `purgeAt`), `mode` enum (`jwt` | `cookie`), `tokenHash` uniqueness, TTL index on `purgeAt`, the full index set, `timestamps: false`, and that `tokenHash` is absent from `toJSON()` output.
- **`describe('verificationTokenSchema')`** — verifies required paths (`userId`, `type`, `tokenHash`, `sentAt`, `expiresAt`), `type` enum closed to `VERIFICATION_TOKEN_TYPES`, `tokenHash` uniqueness, TTL index on `expiresAt`, the partial unique index on `{userId, type}` restricted to `ONE_LIVE_TOKEN_TYPES`, that the complement set is exactly `['mfa-challenge', 'deletion-restore']`, and that `tokenHash` is absent from `toJSON()` output.
- **Serialization guards** — both blocks instantiate a model (`sessionModel` / `verificationTokenModel`) with a sentinel `tokenHash` value and assert `JSON.stringify(row.toJSON())` does not contain it.

## Relationships

- **`src/modules/account/model.ts`** — source of the four tested exports: `sessionSchema`, `verificationTokenSchema`, `sessionModel`, `verificationTokenModel`. Tests are tightly coupled to whatever this file declares.
- **`src/modules/account/token-types.ts`** — supplies `VERIFICATION_TOKEN_TYPES` (full enum) and `ONE_LIVE_TOKEN_TYPES` (subset allowed one-live-per-user) used in the enum and partial-index assertions.
- **`tests/support/schema.ts`** — provides the reusable introspection helpers (`requiredPaths`, `enumOf`, `pathOptions`, `optionsOf`, `indexBehaviour`, `indexSpecs`) that let tests read schema metadata without a DB.

## Notes

- The module doc comment lists the concrete failure each assertion prevents; useful context when an assertion fails in CI.
- `timestamps` is asserted as `false` on `sessionSchema` — the dates are set explicitly by application code, not by Mongoose middleware. `verificationTokenSchema` has no such assertion, so don't assume the same.
- The partial-index test asserts both the positive set (`ONE_LIVE_TOKEN_TYPES`) and the complement, so adding a new token type without updating either constant will break the test.
- Index spec expectations use the string format `"fieldName: +1"` as produced by `indexSpecs`; reordering or adding an index in `model.ts` requires updating the array here.
