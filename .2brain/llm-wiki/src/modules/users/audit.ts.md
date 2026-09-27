---
source: src/modules/users/audit.ts
sha256: 9e7495ecc20bf7f2eda7c94f5ed9fd8314e0ae133e302922b7b857874686267a
generated_at: 2026-09-27T15:35:56.033994+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/audit.ts

## Purpose

Declares the audit action string constants owned by the users module and registers them into the app-wide `AuditActionMap` type via TypeScript declaration merging. It exists so that every audit event the users module emits uses a single, typed vocabulary, and so downstream consumers (query UIs, compliance exports) can filter by these exact action names.

## Key elements

- **`usersAuditActions`** (`const` object, exported) — Maps semantic keys to the string values recorded in audit logs. Covers the full admin lifecycle: `created`, `updated`, `soft_deleted`, `erased`, `restored`, `2FA disabled`, `banned`, `unbanned`, plus one system-originated action (`system.user.erased` for the inactivity reaper).
- **`declare module '@infrastructure/observability/audit'`** — Augments the `AuditActionMap` interface with a `users` key whose type is the union of all values in `usersAuditActions`, giving call-sites exhaustive typing.

## Relationships

- **`src/modules/users/service.ts`** — Emits the actions defined here; its `auditActionForUpdate` logic selects between `ADMIN_USER_UPDATED` and `ADMIN_USER_BANNED`/`ADMIN_USER_UNBANNED` based on the diff.
- **`src/modules/users/controllers/delete-users.ts`** — Triggers `ADMIN_USER_SOFT_DELETED` or `ADMIN_USER_ERASED` depending on the deletion path.
- **`src/modules/users/controllers/restore-users.ts`** — Triggers `ADMIN_USER_RESTORED`.
- **`src/modules/users/tests/integration/service.test.ts`** — Integration tests that assert the correct audit action is recorded for each service operation.
- **`tests/cross-cutting/audit-actions-registered.test.ts`** — Cross-cutting test verifying every module (including this one) is present in the global `AuditActionMap`.

## Notes

- `soft_deleted` and `erased` are intentionally separate actions so an audit query can answer "was an erasure request discharged?" without inspecting row state.
- `banned`/`unbanned` are split out from `updated` so "was this account banned?" is answerable from the action field alone, without diffing two revisions of the user row.
- `SYSTEM_USER_ERASED` deliberately omits the `admin.` prefix because the actor is the inactivity reaper, not a human operator.
- The declaration-merging pattern (vs. a shared enum) is chosen deliberately; see `modules/account/audit.ts` for the rationale.
- `audit-logs/model.ts` widens `action` to `string` so that renaming a constant in the future does not invalidate previously stored log entries.
