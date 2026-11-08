---
source: src/modules/users/audit.ts
sha256: d569c96aa6db22d84cac2e42f115ce6a170c9620725300a04f31071b6fc4f0df
generated_at: 2026-11-08T08:43:09.357867+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/audit.ts

## Purpose

Declares the full set of audit-action string constants for user-record writes and registers them into the app-wide `AuditActionMap` via TypeScript module augmentation. It exists so every audit event emitted anywhere in the users module uses a single, type-safe vocabulary, and so the audit log can answer specific operational questions (e.g. "was this account banned?", "was the erasure actually discharged?") without a reader diffing row revisions.

## Key elements

- **`usersAuditActions`** (`as const`) — The canonical map of every audit action this module emits. Grouped by actor prefix:
  - `admin.*` — Staff-initiated writes (view, create, update, soft-delete, erase, restore, ban/unban, purchase-hold set/lift).
  - `system.*` — Automated writes with no human at the keyboard (inactivity-reaper soft-delete/erase, deletion-lock restore, shop-side purchase-hold set/flag).
- **`declare module '@infrastructure/observability/audit'`** — Augments the shared `AuditActionMap` interface so the `users` key is typed to this module's action values, giving compile-time safety on every emit site.

## Relationships

- **`services/update.ts`** — Emits `ADMIN_USER_UPDATED`, `ADMIN_USER_BANNED`, and `ADMIN_USER_UNBANNED`. Its internal `auditActionForUpdate` helper selects which constant to use based on the payload (ban toggle vs. generic edit).
- **`services/create.ts`** — Emits `ADMIN_USER_CREATED` on staff-driven account creation.
- **`services/remove.ts`** — Emits `ADMIN_USER_SOFT_DELETED`, `ADMIN_USER_ERASED`, `ADMIN_USER_RESTORED`, and the `system.*` reaper variants.
- **`services/purchase-hold.ts`** — Emits `ADMIN_USER_PURCHASE_HOLD_SET`, `ADMIN_USER_PURCHASE_HOLD_LIFTED`, `SYSTEM_USER_PURCHASE_HOLD_SET`, and `SYSTEM_USER_PURCHASE_HOLD_FLAGGED`.
- **`services/activation.ts`** — Emits `SYSTEM_USER_DELETION_LOCK_RESTORED` when the `ops:reapply-erasures` workflow touches a restored database.
- **`controllers/get-user.ts`** — Emits `ADMIN_USER_VIEWED` when staff open a single account's detail page.
- **`services/own-account.ts`** — Operates in the `account` vocabulary (see `modules/account/audit.ts`); does not use constants from this file.
- **`tests/integration/update-audit.test.ts`** and **`tests/integration/service.test.ts`** — Assert that the correct action strings land in the audit log for each service path.
- **`tests/integration/purchase-hold.test.ts`** — Exercises the purchase-hold action constants end-to-end.

## Notes

- The `admin` vs. `system` prefix is a deliberate semantic split, not just a namespacing choice: it records *who* triggered the write. Any new action must pick the correct prefix.
- Actions are intentionally granular (e.g. `ADMIN_USER_BANNED` is separate from `ADMIN_USER_UPDATED`; `ADMIN_USER_PURCHASE_HOLD_LIFTED` is separate from `ADMIN_USER_PURCHASE_HOLD_SET`) so a single log entry is self-explanatory. Resist the temptation to collapse related actions.
- The `audit-logs/model.ts` schema types `action` as a widened `string`, so renaming a constant here does not invalidate already-stored rows. However, the in-code constant name is the source of truth for future emits.
- Module augmentation is used instead of a shared enum so each module owns its own vocabulary independently (see `modules/account/audit.ts` for the same pattern).
