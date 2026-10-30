---
source: src/modules/account/model.ts
sha256: 4d6f556bef2e7f2714155bc828760e518087e01b3049dbb41e3128565cca21e0
generated_at: 2026-10-29T02:35:38.813135+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/model.ts

## Purpose

Defines the three Mongoose schemas and compiled models that the account module owns — `accountexports`, `sessions`, and `verificationtokens`. This file is the single source of truth for the shape, indexes, and serialization rules of those collections; all read/write queries live in `./repository`, and the contract-layer wire shapes are built from these rows separately.

## Key elements

- **`EXPORT_STATUSES`** — `Object.values(AccountExportStatus)`, used as the enum constraint for the export `status` field.
- **`AccountExportDocument` / `AccountExportModel` / `accountExportSchema` / `accountExportModel`** — One row per data-export request. `userId` is `unique` (one live export per account is enforced at the DB level). Indexed on `expiresAt` for the reaper. No `timestamps` plugin; `createdAt`/`expiresAt` are set explicitly.
- **`SessionDocument` / `SessionModel` / `sessionSchema` / `sessionModel`** — One row per session (cookie mode) or per refresh token (jwt mode). `tokenHash` is `unique` and stripped from serialization. Dual-mode fields (`amr`, `remember`, `device`) are cookie-mode-only; `supersededAt` is jwt-mode-only. Indexed on `purgeAt` (TTL via `expireAfterSeconds: 0`) and on `{userId, familyId}`. No `timestamps` plugin.
- **`VerificationTokenDocument` / `VerificationTokenModel` / `verificationTokenSchema` / `verificationTokenModel`** — One row per in-flight one-time link or challenge. `tokenHash` is `unique` and stripped from serialization. TTL on `expiresAt` (`expireAfterSeconds: 0`). A **partial** unique index on `{userId, type}` constrained to `ONE_LIVE_TOKEN_TYPES`, so multi-allowed kinds (delete confirm, MFA challenge) are exempt.

## Relationships

- **`./token-types`** — Imports `VERIFICATION_TOKEN_TYPES` (enum for verification `type`), `ONE_LIVE_TOKEN_TYPES` (drives the partial unique index), and the `VerificationTokenType` type.
- **`./session-mode`** — Imports `SESSION_MODES` (enum for session `mode`) and the `SessionMode` type.
- **`@types`** — Imports `AccountExportStatus` for the export `status` enum and the `AccountExportDocument` interface.
- **`@infrastructure/persistence/serialize`** — Imports `applySerialization` to configure `toJSON` to omit `tokenHash` on the session and verification-token schemas.
- **`./repository`** — The sole consumer of the compiled models for queries; this file defines no query logic.
- **`./index`** — Re-exports the models/schemas for the rest of the module.
- **Test files** (`unit/schema-contract.test.ts`, `unit/auth-schemas.test.ts`, `integration/*.test.ts`, `contract/reauth.contract.test.ts`, `factories.ts`) — Validate schema shape, serialization omission, index presence, and integration behaviour against these models.

## Notes

- **No `timestamps: true` on any schema.** All date fields are set intentionally by the issuing code; the Mongoose auto-stamp would conflict with that intent.
- **`tokenHash` is the only field stripped from serialization**, and it is done via `applySerialization` (not a schema-level `select: false`), so explicit `select('+tokenHash')` in a query can still surface it to the repository layer.
- **TTL indexes use `expireAfterSeconds: 0`** with a per-row date (`purgeAt` / `expiresAt`). This means changing a configured lifetime does not require an index rebuild, but the TTL monitor can lag up to ~1 minute — read paths still check the date field themselves.
- **`familyId` is stable across jwt rotation**; every successor row copies it, so "log out that device" targets the family, not a single token row.
- **The partial unique index on `verificationtokens`** is easy to miss: only the types listed in `ONE_LIVE_TOKEN_TYPES` are constrained to one live row per account. Other types (e.g. MFA challenges) may coexist.
- **The module-level doc comment states explicitly** that these rows are never serialized to the wire as-is; the contract shapes are hand-built from them.
