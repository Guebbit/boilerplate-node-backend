---
source: src/modules/account/presenter.ts
sha256: aed5417035b52743ab23f78c883e086484f56aaf275da6cc3e25843e379a3434
generated_at: 2026-11-08T04:14:07.893371+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/presenter.ts

## Purpose

Pure mapping layer that converts internal row types (sessions, exports, OAuth links) into the wire shapes returned by the account API. It performs no business logic—rules like expiry caps and ownership decisions are made upstream in `session/` and `services/`—and only reshapes already-resolved values into the JSON the controllers send.

## Key elements

- **`sessionFields`** (module-private) — Maps a `SessionRow` + resolved `expiresAt` to an `ExportSession` object. Conditionally includes `lastUsedAt` and `device` only when present.
- **`presentSession`** — Returns a `Session` (extends `ExportSession`) with a `current: boolean` flag for `GET /account/sessions`.
- **`presentExportSession`** — Returns a bare `ExportSession` using the row's own `expiresAt`; no `current` field (used in data exports).
- **`presentExport`** — Returns an `AccountExport` with a `status`, `actions` object (`download`/`request` booleans), and `expiresAt` only when status is `'ready'`. Accepts an externally supplied `status` that may differ from the stored one.
- **`presentOAuthLinks`** — Maps an array of `{ provider, connectedAt }` entries to the `OAuthLinks` wire shape.

## Relationships

- **`src/types/index.ts`** — Source of all output wire types: `Session`, `ExportSession`, `AccountExport`, `AccountExportStatus`, `OAuthLinks`.
- **`src/modules/account/repository.ts`** — Source of input row types: `SessionRow`, `AccountExportRow`.
- **`src/modules/account/services/sessions.ts`** — Upstream caller that resolves `expiresAt` and `current` before invoking `presentSession` / `presentExportSession`.
- **`src/modules/account/session/listing.ts`** — Upstream caller for session listing paths.
- **`src/modules/account/services/export.ts`** — Upstream caller for `presentExport`; determines the effective status passed in.
- **`src/modules/account/controllers/get-oauth-links.ts`** / **`delete-oauth-link.ts`** — Call `presentOAuthLinks` to shape the OAuth link responses.
- **`src/modules/account/tests/unit/presenter.test.ts`** — Unit tests exercising each presenter function.

## Notes

- The module is side-effect-free and has no runtime imports—only `import type`. It is safe to call from any context.
- `lastUsedAt` and `device` are conditionally spread, so they are **absent** (not `null`) in the JSON when the row field is falsy. Consumers should check for key presence, not `null`.
- `presentExport` intentionally decouples the *stored* status from the *presented* status; the caller (see `readOwnExport` in `services/export.ts`) may pass a different status than what is persisted.
- IDs (`familyId`, `_id`) are coerced to `String` at the boundary—the wire never exposes numeric or ObjectId types directly.
- The session's credential token is never included in any presenter output; clients interact via `familyId` as a revocation handle.
