---
source: src/modules/account/model.ts
sha256: de3abfe1b0cf6f43842789b293763d9aad71c3019e1fc5b88a841b063792ceee
generated_at: 2026-11-08T04:11:07.265055+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/model.ts

## Purpose

Defines the four Mongoose schemas and compiled models that make up the account module's persistence layer: `accountexports`, `sessions`, `verificationtokens`, and `erasureledgers`. This file owns the shape of each collection, its indexes, and its serialization rules. All queries live in `./repository`; this file is the contract for what a row looks like.

## Key elements

- **`EXPORT_STATUSES`** — re-exports the `AccountExportStatus` enum values as a plain array for schema use.
- **`AccountExportDocument` / `accountExportSchema` / `accountExportModel`** — one row per data-export request. `userId` is `unique` (one live export per account). Indexed on `expiresAt` for the reaper. No Mongoose timestamps; `createdAt` and `expiresAt` are set explicitly.
- **`SessionDocument` / `sessionSchema` / `sessionModel`** — one row per session (cookie mode) or per refresh token (jwt mode). `tokenHash` is `unique` and omitted from serialization. Dual-mode fields (`authTime`, `amr`, `remember`, `device`) are only meaningful in one mode. TTL via `purgeAt` index. Composite index `{ userId, familyId }` for listing/revocation.
- **`VerificationTokenDocument` / `verificationTokenSchema` / `verificationTokenModel`** — one row per in-flight one-time link or challenge. `tokenHash` is `unique` and omitted from serialization. Partial unique index on `{ userId, type }` constrains only the types in `ONE_LIVE_TOKEN_TYPES`. TTL via `expiresAt` index.
- **`ERASURE_LEDGER_KINDS` / `ErasureLedgerKind`** — the three ledger states: `erased`, `scheduled`, `canceled`.
- **`ErasureLedgerDocument` / `erasureLedgerSchema` / `erasureLedgerModel`** — one row per account lifecycle event. `userId` is a plain `ObjectId` (no `ref`) because the user document may already be gone. Unique on `{ userId, kind }` so repeats update rather than insert. Indexed on `at` (for reapply) and `expiresAt` (for TTL).

## Relationships

- **`./token-types`** — provides `VERIFICATION_TOKEN_TYPES` and `ONE_LIVE_TOKEN_TYPES`, which close the `type` enum and define the partial-index membership for verification tokens.
- **`./session-mode`** — provides `SESSION_MODES` and the `SessionMode` type, closing the `mode` enum on session rows.
- **`@types` (`src/types/index.ts`)** — provides `AccountExportStatus`, the status enum for export rows.
- **`@infrastructure/persistence/serialize`** — `applySerialization` is called on the session and verification-token schemas to strip `tokenHash` from any automatic `toJSON` output.
- **`./repository`** — the sole consumer of the four compiled models; all CRUD and query logic lives there.
- **`./index.ts`** — re-exports the models, document types, and constants for the rest of the module.
- **`./services/erasure-ledger.ts`** — builds and queries erasure-ledger rows using the `ErasureLedgerDocument` shape and `erasureLedgerModel`.
- **Tests** — unit tests (`auth-schemas.test.ts`, `schema-contract.test.ts`) assert the schema shapes; integration tests (`auth-storage.test.ts`, `erasure-ledger.test.ts`, `export.test.ts`, `idle-timeout.test.ts`) and contract tests (`reauth.contract.test.ts`) exercise the models through the repository.

## Notes

- **No Mongoose `timestamps`** on any schema. All temporal fields (`createdAt`, `startedAt`, `lastUsedAt`, `sentAt`, `at`) are set explicitly by application code; a blind `updatedAt` touch is not desired.
- **`tokenHash` is the only field stripped from serialization**, and only on sessions and verification tokens. Export and erasure-ledger rows serialize fully.
- **TTL indexes use `expireAfterSeconds: 0`** with a per-row date column. This means changing a retention setting does not require an index rebuild — the date simply changes per row.
- **The erasure ledger deliberately stores no content data** (no email, IP, user-agent). Only `userId`, `kind`, `at`, and `purgeAt` are recorded (SDM Baustein 60).
- **`userId` in the erasure ledger is not a `ref: 'User'`.** The referenced document may already be hard-deleted; the field is an opaque identifier.
- **The partial unique index on verification tokens** means kinds *not* in `ONE_LIVE_TOKEN_TYPES` (e.g. delete confirmations, MFA challenges) can have multiple concurrent rows per user, while those that are cannot.
