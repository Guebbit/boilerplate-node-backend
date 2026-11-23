---
source: src/modules/account/tests/unit/auth-schemas.test.ts
source_sha256: 71e2362817265f2d6c208b8dd51019221de43dfde94081bc5fdba6ed92aade6e
context_sha256: 32bca3eb0e0c50de23cd192c37c97cdf36af2d710efdf884824ff2489460b2fc
generated_at: 2026-11-22T04:03:39.568290+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/unit/auth-schemas.test.ts

## Purpose
Unit tests that pin the declarations of the `sessions` and `verificationtokens` Mongoose schemas. They target settings whose failure would be silent: a dropped TTL index, a dropped partial unique index, an open `type` enum, or a serialized token digest. The tests read the schema objects directly, so no database is involved.

## Key elements
- **`describe('sessionSchema')`** checks that:
  - the required paths are exactly `expiresAt`, `familyId`, `mode`, `purgeAt`, `startedAt`, `tokenHash` and `userId`;
  - `mode` is limited to `['jwt', 'cookie']`;
  - `tokenHash` is unique;
  - `purgeAt_1` is a TTL index with `expireAfterSeconds: 0`;
  - the declared indexes are exactly `purgeAt_1`, `tokenHash_1` and `userId_1_familyId_1`;
  - `timestamps` is `false`;
  - `toJSON()` of a `sessionModel` document never contains the digest.
- **`describe('verificationTokenSchema')`** checks that:
  - the required paths are exactly `expiresAt`, `sentAt`, `tokenHash`, `type` and `userId`;
  - the `type` enum equals `VERIFICATION_TOKEN_TYPES`;
  - `tokenHash` is unique;
  - `expiresAt_1` is a TTL index with `expireAfterSeconds: 0`;
  - `userId_1_type_1` is unique, with a partial filter `type: { $in: ONE_LIVE_TOKEN_TYPES }`;
  - the types outside `ONE_LIVE_TOKEN_TYPES` are exactly `['mfa-challenge', 'deletion-restore']`;
  - `toJSON()` of a `verificationTokenModel` document never contains the digest.

## Relationships
- `../../model` supplies the schemas under test (`sessionSchema`, `verificationTokenSchema`) and the models (`sessionModel`, `verificationTokenModel`). The models are instantiated only for the serialization checks.
- `../../token-types` supplies `VERIFICATION_TOKEN_TYPES` and `ONE_LIVE_TOKEN_TYPES`. These are the expected values for the enum and the partial-index filter, so the tests follow the vocabulary instead of duplicating it.
- `@tests/schema` (`tests/support/schema.ts`) supplies the introspection helpers `requiredPaths`, `enumOf`, `pathOptions`, `indexBehaviour`, `indexSpecs` and `optionsOf`.

## Notes
- The required-path, index-spec and `mode` assertions use hard-coded lists, so adding a field or index means updating them.
- The index-spec strings use the format `name: field+1, field+1`.
- The sessions TTL uses a separate `purgeAt` field, whereas verification tokens expire on `expiresAt` itself.
