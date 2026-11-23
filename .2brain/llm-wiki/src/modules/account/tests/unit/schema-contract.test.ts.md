---
source: src/modules/account/tests/unit/schema-contract.test.ts
source_sha256: 18358c9208029e462a1087821695f3826b862059602d9c30635cfdb1b74b77b2
context_sha256: e8e386ba77b83fab31997ef6e98bb0aedabd2a634fb64f5eac54fb299767c82f
generated_at: 2026-11-22T04:08:13.526209+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/unit/schema-contract.test.ts

## Purpose
Unit tests that pin down the database-level facts declared by the account module's three Mongoose schemas: account exports, sessions, and verification tokens. Rather than validating documents, they inspect the schema declarations (required paths, unique flags, indexes, TTL options) so that facts a valid fixture cannot reveal (TTL deletion, unique digests, one-live-export constraint) cannot silently change.

## Key elements
- **`describe('accountExportSchema')`**
  - Required paths are exactly `createdAt`, `expiresAt`, `file`, `status`, `userId`.
  - `userId` is `unique`, which enforces one live export per account.
  - Has an `expiresAt_1` index but no `expireAfterSeconds` option, because the reaper deletes both the row and its file, and a TTL index would orphan the file.
  - `timestamps` option is `false`, so the schema sets its own timestamps.
- **`describe('sessionSchema')`**
  - Required paths: `expiresAt`, `familyId`, `mode`, `purgeAt`, `startedAt`, `tokenHash`, `userId`.
  - `tokenHash` is `unique`.
  - `purgeAt_1` has `expireAfterSeconds=0`, so each row is deleted at its own `purgeAt` date and changing a lifetime never rebuilds the index.
  - Compound index `userId_1_familyId_1` (`userId+1, familyId+1`).
- **`describe('verificationTokenSchema')`**
  - Required paths: `expiresAt`, `sentAt`, `tokenHash`, `type`, `userId`.
  - `expiresAt_1` has `expireAfterSeconds=0`.
  - A `userId_1_type_1` index that is unique and has a `partialFilterExpression`, so only kinds that allow a single live link are constrained (kinds that allow several, such as delete confirmations or MFA challenges, are not).

## Relationships
- Imports `accountExportSchema`, `sessionSchema`, and `verificationTokenSchema` from `@modules/account/model`, the schemas under test.
- Uses the helpers `indexOptionSpecs`, `indexSpecs`, `optionsOf`, `pathOptions`, and `requiredPaths` from `@tests/schema` (`tests/support/schema.ts`) to read schema metadata into comparable values and strings.

## Notes
- Required-path assertions use exact `toEqual` lists, so adding or removing a required field fails the test.
- Index assertions match on formatted spec strings (e.g. `'purgeAt_1: expireAfterSeconds=0'`), so they depend on the output format of the `@tests/schema` helpers.
- The partial-index test checks only that the spec string contains `unique=true` and `partialFilterExpression`, not the filter's contents.
