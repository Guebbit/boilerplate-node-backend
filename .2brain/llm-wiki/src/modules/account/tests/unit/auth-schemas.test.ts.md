---
source: src/modules/account/tests/unit/auth-schemas.test.ts
sha256: c762b32fc70735b111847adc778801d74765ab6c68e05934d2262eb8a658d0a8
generated_at: 2026-10-14T09:18:42.333525+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/auth-schemas.test.ts

## Purpose

Unit tests that verify the structural contracts of `sessionSchema` and `verificationTokenSchema` — required fields, enum constraints, index declarations, TTL behaviour, partial-unique indexes, and serialization safety — by reading directly off the Mongoose schema objects with no database involved.

## Key elements

- **`describe('sessionSchema')`** — asserts:
  - Required paths are exactly `expiresAt`, `familyId`, `mode`, `purgeAt`, `startedAt`, `tokenHash`, `userId`.
  - `mode` is restricted to `['jwt', 'cookie']`.
  - `tokenHash` carries a `unique` option.
  - TTL index on `purgeAt` (`expireAfterSeconds: 0`).
  - Exact index set: `purgeAt+1`, `tokenHash+1`, `userId+1, familyId+1`.
  - Mongoose `timestamps` option is `false`.
  - `tokenHash` is absent from `sessionModel#toJSON()` output (serialization test using a real model instance).
- **`describe('verificationTokenSchema')`** — asserts:
  - Required paths: `expiresAt`, `sentAt`, `tokenHash`, `type`, `userId`.
  - `type` enum equals `VERIFICATION_TOKEN_TYPES`.
  - `tokenHash` is unique.
  - TTL index on `expiresAt` (`expireAfterSeconds: 0`).
  - Partial-unique index on `(userId, type)` scoped to `ONE_LIVE_TOKEN_TYPES`; documents that the complement (`delete`, `mfa-challenge`) allows multiple live tokens.
  - `tokenHash` is absent from `verificationTokenModel#toJSON()` output.
- **Helper imports from `@tests/schema`** — `requiredPaths`, `enumOf`, `pathOptions`, `indexBehaviour`, `indexSpecs`, `optionsOf`; each extracts a specific facet of a schema for assertion.

## Relationships

- **`src/modules/account/model.ts`** — provides the two schemas (`sessionSchema`, `verificationTokenSchema`) and their compiled models (`sessionModel`, `verificationTokenModel`) that are the subjects of every assertion.
- **`src/modules/account/token-types.ts`** — supplies `VERIFICATION_TOKEN_TYPES` (the full enum) and `ONE_LIVE_TOKEN_TYPES` (the subset eligible for the partial unique index), both used in expected values.
- **`tests/support/schema.ts`** — supplies the six schema-inspection helpers that turn a Mongoose schema object into plain arrays/objects suitable for `toEqual` comparisons.

## Notes

- No database or network is touched; all assertions operate on in-memory schema metadata, except the two serialization tests which instantiate a model document and call `toJSON()`.
- The two schemas use **different TTL fields**: `sessionSchema` expires on `purgeAt`, `verificationTokenSchema` on `expiresAt`. This is intentional, not a typo.
- The partial-unique-index test asserts the *complement* of `ONE_LIVE_TOKEN_TYPES` equals `['delete', 'mfa-challenge']`, coupling the test to the token-types module's set arithmetic. Adding a new one-live type to `token-types.ts` without updating this test will break it.
- `sessionSchema` explicitly sets `timestamps: false` because the schema manages its own `startedAt`/`expiresAt`/`purgeAt` fields; the test guards against accidentally re-enabling Mongoose's automatic `createdAt`/`updatedAt`.
