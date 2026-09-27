---
source: src/modules/users/controllers/delete-users.ts
sha256: fbb8483892c644eeee0ec490cd271e6129992bc54a3f87484649f34113d68ba2
generated_at: 2026-09-27T15:36:27.746228+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/delete-users.ts

## Purpose

Thin controller that maps the two admin delete endpoints (`DELETE /users` and `DELETE /users/:id`) to the user service, delegating the actual deletion and selecting the correct audit action name. It exists so route registration stays decoupled from the deletion logic and the audit trail records *which* kind of delete (soft vs. hard) occurred.

## Key elements

- **`deleteUsers`** (exported const) — the result of calling `createDeleteController` with:
  - `remove` — delegates to `userService.removeById(id, hardDelete)`.
  - `auditAction` — returns `ADMIN_USER_ERASED` for hard delete, `ADMIN_USER_SOFT_DELETED` otherwise.
  - `notFoundKey` — i18n key `'users.not-found'` used for 404 responses.
- **`?hardDelete=true` query param** — toggles between permanent (hard) and soft delete; only hard delete triggers all registered `personalData.erase` hooks in a single transaction and discharges a GDPR Art. 17 erasure request.

## Relationships

- **`create-delete-controller.ts`** — supplies the `createDeleteController` factory; this file only provides the per-entity config (remove fn, audit selector, not-found key). All HTTP plumbing (parsing id from body vs. path, reading `?hardDelete`, sending 404/204) lives in the factory.
- **`service.ts`** — `userService.removeById` performs the actual soft or hard delete (including the `personalData.erase` hook transaction for hard delete).
- **`audit.ts`** — `usersAuditActions` supplies the two action names that land in the audit log, letting the trail itself answer "was this an Art. 17 erasure?"
- **`routes.ts`** — imports `deleteUsers` and mounts it on the two DELETE paths.

## Notes

- The docblock deliberately avoids listing the `personalData.erase` hooks by name; the authoritative list lives in the generated neighbourhood diagram in `docs/modules/users.md` and is re-checked on every regenerate to prevent silent staleness.
- Only the hard-delete path counts as discharging an Art. 17 request. The audit action name is the sole durable record of which one happened—there is no separate flag stored.
- `DELETE /users` (body-id) and `DELETE /users/:id` (path-id) are the *same* handler; the factory handles both.
