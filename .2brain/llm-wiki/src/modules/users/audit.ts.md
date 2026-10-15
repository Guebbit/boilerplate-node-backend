---
source: src/modules/users/audit.ts
sha256: 410ffc6912abf23ca8ecc505cd226f3b7a4d097705c1f6f411f7e226b0e134b6
generated_at: 2026-10-15T12:06:09.526493+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/audit.ts

## Purpose

Declares the audit-action vocabulary owned by the users module and registers it into the app-wide `AuditActionMap` type via TypeScript module augmentation. Every write (and one targeted read) that the users module performs emits one of these action strings into the audit log.

## Key elements

- **`usersAuditActions`** (`as const` object) — the full set of action strings this module emits:
  - `ADMIN_USER_VIEWED` — staff opened a single account's detail page (the personal-data read, not the list).
  - `ADMIN_USER_CREATED` / `ADMIN_USER_UPDATED` — standard create and generic edit.
  - `ADMIN_USER_SOFT_DELETED` / `ADMIN_USER_ERASED` — reversible delete vs. irreversible erasure.
  - `ADMIN_USER_RESTORED` — undo of a soft delete.
  - `SYSTEM_USER_SOFT_DELETED` / `SYSTEM_USER_ERASED` — the inactivity reaper's own lifecycle actions (no human at the keyboard).
  - `ADMIN_USER_BANNED` / `ADMIN_USER_UNBANNED` — toggle of `active: false`/`true` via the same PUT used by every other edit.
- **`declare module '@infrastructure/observability/audit'`** — augments `AuditActionMap` with a `users` key typed as the union of all values above, making the actions part of the app-wide type system.

## Relationships

- **`src/modules/users/services/update.ts`** — its `auditActionForUpdate` helper picks between `ADMIN_USER_UPDATED`, `ADMIN_USER_BANNED`, or `ADMIN_USER_UNBANNED` depending on whether the `active` field changed.
- **`src/modules/users/services/create.ts`** — emits `ADMIN_USER_CREATED` on successful creation.
- **`src/modules/users/services/remove.ts`** — emits `ADMIN_USER_SOFT_DELETED`, `ADMIN_USER_ERASED`, or `ADMIN_USER_RESTORED` depending on the operation.
- **`src/modules/users/controllers/get-user-item.ts`** — emits `ADMIN_USER_VIEWED` when staff opens a single user's detail.
- **`tests/cross-cutting/audit-actions-registered.test.ts`** — verifies that every value in `usersAuditActions` is present in the app-wide `AuditActionMap` (guards against unregistered actions).
- **`src/modules/users/tests/integration/service.test.ts`** — integration tests that assert the correct action string is written to the audit log for each service operation.

## Notes

- **Prefix convention:** `admin.*` = a staff member acting on someone else's record; `system.*` = automated reaper; self-service actions live under `account.*` (see `modules/account/audit.ts`).
- **Soft delete ≠ erasure:** the split exists so the audit trail can answer "was an erasure request actually discharged?" A soft delete is reversible; `ADMIN_USER_ERASED` is not.
- **Ban/unban split from generic update:** both go through the same PUT endpoint, so the row diff alone cannot distinguish a ban from any other field change.
- **Renamed actions don't break history:** `audit-logs/model.ts` types the stored `action` column as a widened `string` specifically so that renaming a constant here doesn't invalidate previously logged rows.
- **No shared enum:** actions are declared per-module by augmentation rather than a central enum (rationale documented in `modules/account/audit.ts`).
