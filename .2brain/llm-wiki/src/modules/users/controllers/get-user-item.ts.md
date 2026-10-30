---
source: src/modules/users/controllers/get-user-item.ts
sha256: f3d1bb8f8484a99ce08faf6de6d956d452b835f0ea99e261fa74d46d34f95f22
generated_at: 2026-10-29T06:11:25.321262+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/get-user-item.ts

## Purpose

Route handler for `GET /users/:id` — retrieves a single user document by path id and returns it as a serialised contract. Restricted to admin callers (enforced upstream by the route/authorization layer). Exists as a thin adapter between the HTTP surface and the user service.

## Key elements

- **`getUserItem`** (export) — the controller instance produced by `createItemController`. Accepts `{ entity, notFoundKey, fetch }` and returns a ready-to-mount HTTP handler.
- **`fetch` callback** — the core logic: calls `userService.getById(id)`, returns `undefined` for 404, records a staff-read audit event, then delegates to `userService.toUserContract(user, caller)` to shape the response.

## Relationships

- **`src/infrastructure/surfaces/create-item-controller.ts`** — supplies the `createItemController` factory that wraps the fetch callback with standard item-route plumbing (entity name, not-found key, 404 handling).
- **`src/modules/users/services/index.ts`** — provides `userService.getById` (data access) and `userService.toUserContract` (serialisation / permission-aware shaping).
- **`src/infrastructure/http/request.ts`** — provides `callerContextOf(request)` to extract the authenticated caller identity from the incoming request.
- **`src/kernel/staff-read.ts`** — provides `recordStaffRead`, the audit-logging call executed after a successful fetch.
- **`src/modules/users/audit.ts`** — provides the `usersAuditActions.ADMIN_USER_VIEWED` action constant used in the audit record.
- **`src/modules/users/routes.ts`** — registers `getUserItem` on the `GET /users/:id` route.

## Notes

- `toUserContract` re-reads the caller's **current** role from the membership store on every request; the user document itself carries no role data. This adds one indexed lookup per read but is the same cost class as the authorization checks already in the path.
- The audit record sets both `targetId` and `ownerId` to the same `id` (the looked-up user), signalling the record belongs to that user.
- A `null`/`undefined` return from the fetch callback is the contract for "not found" — do not throw inside `fetch`; let `createItemController` handle the 404.
