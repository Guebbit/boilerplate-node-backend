---
source: src/modules/users/audit.ts
sha256: 816b3154ad1f612659e7164c11425a24acbca364703494c3a7283e5a10a27bf0
generated_at: 2026-10-29T06:10:28.072615+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/audit.ts

## Purpose

Declares the complete set of audit action identifiers emitted by the `users` module and registers them into the app-wide `AuditActionMap` type via TypeScript module augmentation. This gives every service in the module a typed, single-source vocabulary for logging writes and reads to the user record.

## Key elements

- **`usersAuditActions`** — `as const` object holding all action string literals. Actions are grouped by actor prefix:
  - `admin.*` — staff-initiated writes/reads (view, create, update, soft-delete, erase, restore, ban, un-ban, purchase-hold set/lift).
  - `system.*` — automated actions with no human at the keyboard (inactivity reaper soft-delete/erase, shop-rule purchase-hold set/flag).
- **Module augmentation** (`declare module '@infrastructure/observability/audit'`) — adds a `users` key to `AuditActionMap`, unioning the values of `usersAuditActions` into the global audit-action type.

## Relationships

- **Emit (consumers of these actions):**
  - `services/create.ts`, `services/update.ts`, `services/remove.ts`, `services/activation.ts`, `services/purchase-hold.ts` — each service emits the relevant `usersAuditActions` value when performing its write.
  - `controllers/get-user-item.ts` — emits `ADMIN_USER_VIEWED` on single-account detail reads.
- **Typed registration verified by:**
  - `tests/cross-cutting/audit-actions-registered.test.ts` — asserts every module's actions appear in `AuditActionMap`.
- **Behavioral tests:**
  - `tests/integration/service.test.ts`, `tests/integration/update-audit.test.ts`, `tests/integration/purchase-hold.test.ts` — exercise services and assert the correct action string lands in the audit log.

## Notes

- **Soft-delete vs. erase is a deliberate split.** Only the hard path (`ADMIN_USER_ERASED`) actually scrubs the record; `ADMIN_USER_SOFT_DELETED` is reversible. The split lets the audit trail directly answer "was the erasure request discharged?" without diffing revisions.
- **Ban/un-ban are separate actions** (`ADMIN_USER_BANNED` / `ADMIN_USER_UNBANNED`) rather than a generic `ADMIN_USER_UPDATED`, so a reader does not have to diff two row revisions to discover a ban. See `services/update.ts` → `auditActionForUpdate` for the dispatch logic.
- **`audit-logs/model.ts` types `action` as a widened `string`** (not the literal union) so renaming an action in code does not invalidate already-persisted history.
- **`ADMIN_USER_PURCHASE_HOLD_LIFTED`** covers two distinct events (lifting a hold *and* clearing a review flag with no remaining hold); the `metadata.inForce` field on the audit record disambiguates them.
- The file follows the same augmentation pattern as `modules/account/audit.ts`; the rationale for per-module augmentation (vs. a shared enum) is documented there.
