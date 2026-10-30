---
source: src/modules/account/presenter.ts
sha256: aed5417035b52743ab23f78c883e086484f56aaf275da6cc3e25843e379a3434
generated_at: 2026-10-29T02:37:59.232060+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/presenter.ts

## Purpose

Pure mapping layer that converts internal database rows (`SessionRow`, `AccountExportRow`) and service results into the wire shapes clients expect. It contains no business logic: decisions such as "which sessions belong to the caller" or "when the staff lifetime cap ends a session" are made upstream in services, and this file only serializes already-decided values.

## Key elements

- **`sessionFields`** (private) — shared mapper producing the common session fields (`id`, `createdAt`, `expiration`, optional `lastUsedAt`, optional `device`). Conditionally spreads `lastUsedAt` and `device` so an absent value reads as "unused/unknown" rather than `null`.
- **`presentSession(row, expiresAt, current)`** → `Session` — full session shape for `GET /account/sessions`; adds the `current` boolean.
- **`presentExportSession(row)`** → `ExportSession` — session shape for the data export; uses `row.expiresAt` directly (no staff cap) and omits `current`.
- **`presentExport(row, status)`** → `AccountExport` — export resource; computes `actions` from status and includes `expiresAt` **only** when status is `'ready'`.
- **`presentOAuthLinks(links)`** → `OAuthLinks` — maps the provider list to the wire shape.

## Relationships

- **`src/modules/account/repository.ts`** — provides the `SessionRow` and `AccountExportRow` types this file maps from.
- **`src/types/index.ts`** — provides the wire types (`Session`, `ExportSession`, `AccountExport`, `AccountExportStatus`, `OAuthLinks`) that the presenters produce.
- **`src/modules/account/services/sessions.ts`** — upstream caller that decides `current` and the effective `expiresAt` before calling `presentSession`.
- **`src/modules/account/services/export.ts`** — upstream caller that resolves the export row and effective status before calling `presentExport`.
- **`src/modules/account/controllers/get-oauth-links.ts`** / **`delete-oauth-link.ts`** — endpoint handlers that call `presentOAuthLinks` to build their responses.
- **`src/modules/account/tests/unit/presenter.test.ts`** — unit tests exercising each exported presenter.

## Notes

- **Strictly pure.** No I/O, no branching on ownership or policy. If a rule is needed, it belongs in `services/` or `session/`, not here.
- **`lastUsedAt` / `device` are optional by omission.** The spread-with-ternary pattern means a missing key is the "absent" signal, not a `null` value.
- **Export `expiresAt` is status-gated.** On any status other than `'ready'` the field is deliberately omitted; the stored date is bookkeeping, not a delivery promise.
- **`presentExportSession` bypasses the staff cap.** It reads `row.expiresAt` directly, unlike `presentSession` which accepts the (potentially capped) date as a parameter.
