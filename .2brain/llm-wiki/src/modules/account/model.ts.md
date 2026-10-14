---
source: src/modules/account/model.ts
sha256: ffb384596b61290b521a9ce7f8896c8c5333d79e521d3172d138e5a481a72a47
generated_at: 2026-10-14T08:41:25.076565+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/model.ts

## Purpose

Defines the Mongoose schemas, TypeScript document interfaces, and compiled models for the three MongoDB collections owned by the account module: `accountexports`, `sessions`, and `verificationtokens`. The file is purely declarative—no query logic lives here (that is `./repository`)—and it enforces structural invariants (unique indexes, partial-index constraints, TTL-style expiry) at the database level.

## Key elements

- **`EXPORT_STATUSES` / `ExportStatus`** – Closed set (`'building' | 'ready' | 'failed'`) for the export lifecycle.
- **`AccountExportDocument` / `accountExportSchema` / `accountExportModel`** – Schema for one data-export request per user. `userId` is `unique: true` so two concurrent requests cannot both insert. Indexed on `expiresAt` for the reaper's sweep.
- **`SessionDocument` / `sessionSchema` / `sessionModel`** – Schema for signed-in sessions (cookie mode) or refresh tokens (JWT mode). Fields are mode-conditional (`authTime`, `amr`, `remember`, `device` are cookie-only; `supersededAt` is JWT-only). `tokenHash` is `unique` and omitted from serialization. TTL via `expireAfterSeconds: 0` on `purgeAt`. Compound index `{userId, familyId}` for listing and revocation.
- **`VerificationTokenDocument` / `verificationTokenSchema` / `verificationTokenModel`** – Schema for one-time links/challenges. `tokenHash` is `unique` and omitted from serialization. TTL via `expireAfterSeconds: 0` on `expiresAt`. A **partial** unique index on `{userId, type}` constrains only the types in `ONE_LIVE_TOKEN_TYPES`.
- All three schemas set `{ timestamps: false }`; dates are set explicitly by application code.

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** – Imports `applySerialization`, which strips `tokenHash` from the JSON output of the session and verification-token schemas.
- **`src/modules/account/session-mode.ts`** – Supplies `SESSION_MODES` (enum values) and the `SessionMode` type used by the `mode` field on `sessionSchema`.
- **`src/modules/account/token-types.ts`** – Supplies `VERIFICATION_TOKEN_TYPES` (enum values), `ONE_LIVE_TOKEN_TYPES` (subset for the partial index), and the `VerificationTokenType` type.
- **`src/modules/account/repository.ts`** – Imports the three compiled models (`accountExportModel`, `sessionModel`, `verificationTokenModel`) to run all CRUD and query operations.
- **`src/modules/account/index.ts`** – Barrel file; re-exports the public types and models defined here.
- **`src/modules/account/tests/factories.ts`** – Test factories construct `AccountExportDocument`, `SessionDocument`, and `VerificationTokenDocument` instances for seeding.
- **`src/modules/account/tests/unit/auth-schemas.test.ts`** – Unit-tests the schema definitions (required fields, enum enforcement, serialization omission).
- **`src/modules/account/tests/integration/auth-storage.test.ts`** – Integration tests exercising session and verification-token persistence.
- **`src/modules/account/tests/integration/export.test.ts`** – Integration tests for the `accountexports` collection lifecycle.

## Notes

- **Raw tokens never leave the server.** All three token-bearing fields are sha256 digests (`tokenHash`), and `applySerialization` removes them from any `toJSON`/`toObject` output. The module doc comment stresses that wire shapes are built by hand, not from the row directly.
- **TTL is per-row, not env-driven.** The `expireAfterSeconds: 0` index pattern means changing a session lifetime is a data change, not an index rebuild.
- **`timestamps: false` everywhere.** `createdAt`/`startedAt`/`sentAt` are set at request time, and `expiresAt`/`purgeAt`/`lastUsedAt` are mutated intentionally. Mongoose's automatic `updatedAt` would be noise.
- **Partial index on `verificationtokens`.** The unique constraint on `{userId, type}` applies *only* to types listed in `ONE_LIVE_TOKEN_TYPES`; types like delete-confirmation or MFA-challenge can have multiple live rows per user.
