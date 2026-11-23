---
source: src/modules/account/model.ts
source_sha256: ea79c531a26fac671b9848f214d9d3d9fad3968dc2c142ae9ebdc82849fc0241
context_sha256: a7675879bf469a9c69fa5ae5a5e8093ba3258dbbf04e092aa8a451c0b505617d
generated_at: 2026-11-22T03:30:50.519057+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/model.ts

## Purpose
Defines the Mongoose schemas, document interfaces, and compiled models for the four collections the account module owns: `accountexports`, `sessions`, `verificationtokens`, and `erasureledgers`. These rows are never sent over the wire as-is. The contract's shapes are built from them by hand, and token digests are stripped from `toJSON`.

## Key elements
- **`EXPORT_STATUSES`**: values of `AccountExportStatus` (from `@types`). A row is `building` until the worker settles it, then it takes one of the other two.
- **`AccountExportDocument` / `accountExportSchema` / `accountExportModel`**: one export per account. `userId` is `unique`, so only one live export can exist per account. Fields: `status`, `file` (name in the private export store), `createdAt`, `expiresAt`. An `expiresAt` index serves the reaper.
- **`SessionDocument` / `sessionSchema` / `sessionModel`**: one row per refresh token in `jwt` mode, or per session in `cookie` mode.
  - `familyId` is the externally visible session id and stays stable across rotation.
  - `tokenHash` is unique and omitted from serialization.
  - Optional fields: `authTime`, `amr`, `remember`, `device`, `lastUsedAt`, `supersededAt`.
  - `expiresAt` is the logical end of the session; `purgeAt` is when the database deletes the row.
  - Indexes: a TTL index on `purgeAt` (`expireAfterSeconds: 0`) and `{ userId, familyId }`.
- **`VerificationTokenDocument` / `verificationTokenSchema` / `verificationTokenModel`**: one-time links or challenges.
  - `type` is restricted to `VERIFICATION_TOKEN_TYPES`.
  - `tokenHash` is unique and omitted from serialization.
  - `sentAt` is the basis for resend cooldowns.
  - `amr` is used by MFA challenges only.
  - Indexes: a TTL index on `expiresAt`, plus a partial unique index on `{ userId, type }` limited to `ONE_LIVE_TOKEN_TYPES`.
- **`ERASURE_LEDGER_KINDS` / `ErasureLedgerKind`**: `'erased' | 'scheduled' | 'canceled'`.
- **`ErasureLedgerDocument` / `erasureLedgerSchema` / `erasureLedgerModel`**: a content-free record of erasures. `userId` is not a reference because the user document may be gone. `purgeAt` is stored on `scheduled` rows only. Indexes: unique `{ userId, kind }`, `{ at }`, and a TTL index on `expiresAt`.
- **`AccountExportModel`, `SessionModel`, `VerificationTokenModel`, `ErasureLedgerModel`**: `Model` type aliases.

## Relationships
- **`@infrastructure/persistence/serialize`** (`serialize.ts`): provides `applySerialization`, used to omit `tokenHash` on the sessions and verification-token schemas.
- **`./token-types`**: supplies `VERIFICATION_TOKEN_TYPES`, `ONE_LIVE_TOKEN_TYPES`, and the `VerificationTokenType` type.
- **`./session-mode`**: supplies `SESSION_MODES` and the `SessionMode` type.
- **`@types`** (`src/types/index.ts`): supplies the `AccountExportStatus` enum.
- **`./repository`**: all queries run against these models. The file's own comments state this.
- **`./services/erasure-ledger`, `./index`, and the tests** (contract, integration, unit, and `factories.ts`): sit alongside this file in the dependency graph. They are presumably consumers of the schemas and models, but that is not visible from this file.

## Notes
- None of the schemas use `timestamps`. `createdAt`, `startedAt`, `lastUsedAt`, and `expiresAt` are set explicitly.
- Expiry is per-row via TTL indexes with `expireAfterSeconds: 0` on a date field, so changing a lifetime or retention setting never forces an index rebuild.
- The TTL monitor can lag by up to about a minute, so reads still check `expiresAt` themselves.
- Only hashes are stored (sha256 of the credential or link value), never the raw values.
- Spending a verification token deletes its row, so there is no "used" state.
- A session row of the other mode is never listed or honoured.
- In `jwt` mode a rotation adds a successor row with the same `familyId` and stamps the old row `supersededAt`. The old row is kept for its reuse-detection window.
- Repeat ledger events move `at` on the existing row instead of adding a new one.
