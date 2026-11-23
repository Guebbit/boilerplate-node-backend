---
source: src/modules/account/presenter.ts
source_sha256: 8554ff18001ac3c3d975151a92e0c1254706613b9575564fb12b57607e44b9e5
context_sha256: 9ae2546aedf171ebfdaaf288372239187da4463c414dbd48eee830d91ad299c3
generated_at: 2026-11-22T03:33:41.963693+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/presenter.ts

## Purpose
Single place where stored session rows, export rows, and OAuth link lists are turned into their wire (API response) shapes. It is pure: it only maps values that callers have already decided (which sessions are the caller's own, when the staff lifetime cap ends a session), so the rules stay in `session/` and `services/`. A session's credential never reaches the wire; the family id is the handle a client revokes by.

## Key elements
- `sessionFields` (internal) – shared fields for a session: `id` (stringified `familyId`), `createdAt` (from `startedAt`), `expiration`, and optionally `lastUsedAt` and `device`. `lastUsedAt` is omitted until the session has been used, so an unused session reads as unused.
- `presentSession(row, expiresAt, current)` – session as listed by `GET /account/sessions`: the shared fields plus `current`. `expiresAt` is passed in with the staff cap already applied.
- `presentExportSession(row)` – session as carried in a data export: metadata only, no `current`, and uses the row's own `expiresAt`.
- `presentExport(row, status)` – export as returned by `POST` and `GET /account/export`. It sets `actions.download` to `status === 'ready'` and `actions.request` to `status !== 'building'`. `expiresAt` is included only when `status` is `ready`.
- `presentOAuthLinks(links)` – maps `{provider, connectedAt}[]` to `{ links: [...] }` with ISO date strings. It backs `GET /account/oauth/links` and `DELETE /account/oauth/links/{provider}`.

## Relationships
- Imports `SessionRow` and `AccountExportRow` types from `src/modules/account/repository.ts`, and the wire types (`AccountExport`, `AccountExportStatus`, `ExportSession`, `OAuthLinks`, `Session`) from `src/types/index.ts` via `@types`.
- `src/modules/account/controllers/get-oauth-links.ts` and `src/modules/account/controllers/delete-oauth-link.ts` are the OAuth-link endpoints that `presentOAuthLinks` documents as its consumers.
- `src/modules/account/services/sessions.ts`, `src/modules/account/session/listing.ts`, and `src/modules/account/services/export.ts` supply the already-decided inputs: session ownership and expiry, and export status.
- `src/modules/account/tests/unit/presenter.test.ts` covers this module.

## Notes
- The status passed to `presentExport` is not always the stored one (the doc comment points to `readOwnExport`), so the caller decides what to display.
- `expiresAt` on an export is deliberately hidden unless the export is `ready`; otherwise it is only a bookkeeping date, not a promise about a file.
- All dates are serialized with `toISOString()`.
