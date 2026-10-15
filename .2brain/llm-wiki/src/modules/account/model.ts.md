---
source: src/modules/account/model.ts
sha256: e402c086d6cf9ed62efbf992effe01b366af24b3c2f7b3aa51d9d44337fd47ca
generated_at: 2026-10-15T09:57:26.317666+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/model.ts

## Purpose

Defines the three Mongoose schemas, document interfaces, and compiled models that make up the account module's persistence layer: `accountexports` (data-export progress), `sessions` (signed-in sessions or refresh tokens), and `verificationtokens` (one-time links/challenges in flight). This file is the single source of truth for the shape of those collections; all queries live elsewhere in `./repository`.

## Key elements

- **`EXPORT_STATUSES` / `ExportStatus`** – Closed union of the three states an export row can be in: `building`, `ready`, `failed`.
- **`AccountExportDocument` / `accountExportSchema` / `accountExportModel`** – One row per account that requested a data export. `userId` is `unique` so a second concurrent request cannot create a duplicate row. `expiresAt` drives both the reaper and a plain index (no TTL).
- **`SessionDocument` / `sessionSchema` / `sessionModel`** – One row per active session (cookie mode) or per refresh token (jwt mode). Carries `familyId` (stable across rotation), `tokenHash` (sha256 digest, never the raw credential), `mode`, `authTime`, `amr`, `remember`, `supersededAt`, `expiresAt`, and `purgeAt`. `tokenHash` is `unique`. Uses a per-row TTL index (`expireAfterSeconds: 0` on `purgeAt`) instead of an env-driven TTL.
- **`VerificationTokenDocument` / `verificationTokenSchema` / `verificationTokenModel`** – One row per in-flight one-time link or MFA challenge. `tokenHash` is `unique`; spending the token deletes the row (no "used" state). A **partial** unique index on `{ userId, type }` enforces "one live token per account" only for types listed in `ONE_LIVE_TOKEN_TYPES`, leaving types that allow multiples unconstrained.
- **`applySerialization` calls** – Both the session and verification-token schemas strip `tokenHash` from `toJSON` output so the digest never leaks through an accidental `JSON.stringify`.

## Relationships

- **`./token-types.ts`** – Supplies `VERIFICATION_TOKEN_TYPES` (enum values), `ONE_LIVE_TOKEN_TYPES` (subset for the partial index), and the `VerificationTokenType` type used in the verification-token schema.
- **`./session-mode.ts`** – Supplies `SESSION_MODES` (enum values) and the `SessionMode` type for the session schema's `mode` field.
- **`@infrastructure/persistence/serialize.ts`** – Provides `applySerialization`, called to configure the `omit` list on `sessionSchema` and `verificationTokenSchema`.
- **`./repository.ts`** – The sole consumer of the compiled models (`accountExportModel`, `sessionModel`, `verificationTokenModel`) for all CRUD operations; this file intentionally contains no query logic.
- **`./index.ts`** – Re-exports the public surface of this module (interfaces, models, enums) to the rest of the codebase.
- **Test files** (`tests/factories.ts`, `tests/unit/auth-schemas.test.ts`, `tests/integration/*.test.ts`) – Build fixture documents from these interfaces and exercise the schemas' validation, serialization, and TTL behavior.

## Notes

- **`timestamps: false`** is set on all three schemas. The `createdAt`/`startedAt`/`sentAt` fields are set intentionally at creation time, and `expiresAt`/`purgeAt` are mutated on purpose; Mongoose's automatic `updatedAt` would be a misleading "edit" signal.
- **Per-row TTL over env TTL.** Sessions and verification tokens use `expireAfterSeconds: 0` with a per-document date field, so changing a lifetime setting does not require rebuilding the index. Reads still check `expiresAt` in application code because the TTL monitor can lag by up to a minute.
- **Token digests are never stored in plaintext.** Only sha256 hashes are persisted; the raw credential (refresh JWT or opaque session id) exists only in memory or in the cookie/JWT itself.
- **No wire serialization.** The doc block explicitly states these rows are never sent as-is; API contract shapes are built from these fields by hand in the repository/service layer.
- **`familyId` is stable across rotation.** In jwt mode, every rotation successor copies the same `familyId`, so the session list and "log out that device" operate on the family, not on a single token row.
