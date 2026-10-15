---
source: src/modules/users/controllers/get-user-item.ts
sha256: 5bd7d98f5230328b7146d8409e492c6771ca4b5c065f532ebf7c26a5eb550cb1
generated_at: 2026-10-15T12:06:59.320171+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/get-user-item.ts

## Purpose

HTTP controller for `GET /users/:id`, restricted to admin callers. It fetches a single user by path id, records a staff-read audit event, and returns the user shaped through the standard contract. Exists to keep the users module's read endpoint thin and auditable while delegating data access and serialization to the service layer.

## Key elements

- **`getUserItem`** (exported) — The route handler, built via `createItemController`. Accepts `entity: 'user'` and a `fetch` callback that:
  1. Calls `userService.getById(id)`; returns `undefined` (→ 404) if not found.
  2. Calls `recordStaffRead` with key `users.any.read`, action `ADMIN_USER_VIEWED`, and `targetId`/`ownerId` both set to the looked-up user's id.
  3. Serializes the user with `userService.toUserContract(user, request.caller)` before returning.

- **`notFoundKey`** — Set to `'users.not-found'` for the localized 404 message.

## Relationships

- **`@infrastructure/surfaces/create-item-controller`** — Provides the `createItemController` factory that wraps the `fetch` callback into a full GET handler (parsing `:id`, error handling, response envelope).
- **`@kernel/staff-read`** — `recordStaffRead` is invoked on every successful read to log the audit event.
- **`../audit`** — Supplies the `usersAuditActions.ADMIN_USER_VIEWED` action constant used in the audit record.
- **`../services/index`** — Source of `userService.getById` and `userService.toUserContract`.
- **`../routes`** — Registers `getUserItem` on the `GET /users/:id` route.

## Notes

- `toUserContract` resolves the caller's **current** role from the membership store on every call; the user document itself carries no role. This adds one indexed lookup per read (noted in the inline comment as acceptable cost).
- In the audit record, `ownerId` is set to the same value as `targetId` (the viewed user's id), not the actor's id. This is intentional per the code but non-obvious at first glance.
- The endpoint is admin-only; the authorization check is handled upstream (by the framework or middleware) before `fetch` executes.
