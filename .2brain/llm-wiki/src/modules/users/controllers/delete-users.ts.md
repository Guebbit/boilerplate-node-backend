---
source: src/modules/users/controllers/delete-users.ts
sha256: 2190a739b4023c7f6df986899fa9d1fc95e44eec0432cf87226c3c0f94a99d82
generated_at: 2026-09-23T19:31:54.168761+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/delete-users.ts

## Purpose

Thin controller that wires the `DELETE /users` and `DELETE /users/:id` admin endpoints to the user service. It delegates actual deletion logic to `userService` and records the correct audit action (soft vs. hard/erasure) so the audit trail can later satisfy Art. 17 compliance questions.

## Key elements

- **`deleteUsers`** (exported const) — the controller object produced by `createDeleteController`. Configures:
  - `entity: 'user'`
  - `remove(id, hardDelete)` — calls `userService.removeById(id, hardDelete)`
  - `auditAction(hardDelete)` — returns `usersAuditActions.ADMIN_USER_ERASED` or `usersAuditActions.ADMIN_USER_SOFT_DELETED`
  - `notFoundKey: 'users.not-found'` (i18n key for 404 responses)

## Relationships

- **`src/infrastructure/surfaces/create-delete-controller.ts`** — Provides the `createDeleteController` factory that builds the request handler (parsing id from body/path, reading `?hardDelete`, invoking `remove`, emitting audit). This file is purely configuration for that factory.
- **`src/modules/users/service.ts`** — Supplies `userService.removeById`, which performs the actual soft/hard deletion and (per the doc comment) announces `USER_DELETED` on hard delete, cascading to cart, wishlist, and address book.
- **`src/modules/users/audit.ts`** — Exports `usersAuditActions`; this file picks the correct action name based on the `hardDelete` flag.
- **`src/modules/users/routes.ts`** — Registers `deleteUsers` on the `DELETE /users` and `DELETE /users/:id` routes (the controller is the target of those route handlers).

## Notes

- Only the `?hardDelete=true` path discharges a GDPR Art. 17 erasure request. The audit action name (`ADMIN_USER_ERASED` vs. `ADMIN_USER_SOFT_DELETED`) is the record that distinguishes the two.
- Soft delete is the default; no query parameter is needed.
- The id can arrive either in the request body (`DELETE /users`) or as a path param (`DELETE /users/:id`) — the `createDeleteController` factory handles both.
