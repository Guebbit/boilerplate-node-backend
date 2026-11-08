---
source: src/modules/users/controllers/get-user.ts
sha256: f3d1bb8f8484a99ce08faf6de6d956d452b835f0ea99e261fa74d46d34f95f22
generated_at: 2026-11-08T08:44:06.766751+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/get-user.ts

## Purpose

Controller for `GET /users/:id` (admin-only). Resolves a single user by path id, records a staff-read audit event, and returns the user serialized through the standard contract.

## Key elements

- **`getUserItem`** (export) — The controller instance, built via `createItemController`. Accepts `{ entity, notFoundKey, fetch }` config:
  - `entity: 'user'` / `notFoundKey: 'users.not-found'` — standard 404 handling for the entity.
  - `fetch(id, request)` — delegates to `userService.getById(id)`; on a non-null result, fires `recordStaffRead` with the `ADMIN_USER_VIEWED` audit action, then returns `userService.toUserContract(user, caller)`.

## Relationships

- **`@infrastructure/surfaces/create-item-controller`** — Provides the `createItemController` factory that wraps `fetch` with standard routing, error, and response plumbing.
- **`@infrastructure/http/request`** — Provides `callerContextOf(request)` to extract the authenticated caller identity for contract serialization.
- **`../services` (`userService`)** — `getById` loads the document; `toUserContract` shapes the response.
- **`@kernel/staff-read`** — `recordStaffRead` writes the audit entry keyed to the caller's staff record.
- **`../audit`** — Supplies `usersAuditActions.ADMIN_USER_VIEWED` (the action token for the audit log).
- **`../routes`** — Graph neighbor; expected to register this controller under the `/users/:id` GET route.

## Notes

- `toUserContract` does **not** read role from the user document. It performs a separate indexed lookup against the membership store to resolve the caller's *current* role. This is intentional (role is never persisted on the user doc) and adds one indexed lookup per request.
- The `ownerId` in the `recordStaffRead` payload is set to the target user's `id`, not the caller's — the audit treats the viewed user as the "owner" of the read event.
- If `getById` returns a falsy value, `fetch` returns `undefined`, which `createItemController` interprets as a 404 using `notFoundKey`.
