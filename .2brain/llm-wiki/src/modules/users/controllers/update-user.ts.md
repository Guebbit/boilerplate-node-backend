---
source: src/modules/users/controllers/update-user.ts
sha256: 633aad1f52a0d0e2469a3b618b61cdd0ecf638672f27e0bb4b3e20bfbc3de65f
generated_at: 2026-11-08T08:45:11.682238+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/update-user.ts

## Purpose

Defines the HTTP handlers for `PUT /users/:id` (full replace) and `PATCH /users/:id` (partial merge) by configuring the shared `createUpdateController` factory. It handles avatar image upload before delegating the actual field merge and audit to `userService.updateById`.

## Key elements

- **`replaceUser`** — The `PUT /users/:id` handler. Requires a full body validated against `ReplaceUserByIdBody`. Omits nothing (except `imageUrl`, see below).
- **`updateUser`** — The `PATCH /users/:id` handler. Accepts a partial body validated against `UpdateUserByIdBody`; only supplied fields are changed.
- **`update` callback** (inside the factory call) — Wraps the service call with `writeWithUploadedImage`, so if a new avatar is attached to the request it is persisted first, then the resulting `image` object is spread into the changes passed to `userService.updateById`.
- **`present` callback** — Transforms the raw user entity into the API response shape via `userService.toUserContract`, scoped to the requesting caller.

## Relationships

- **`src/infrastructure/surfaces/create-update-controller.ts`** — Provides the `createUpdateController` factory; this file supplies all configuration (schemas, entity name, versioning, the `update`/`present` callbacks) and receives back the `{ replace, update }` handler pair.
- **`src/infrastructure/http/uploads.ts`** — `writeWithUploadedImage` is invoked inside the `update` callback to process an optional avatar upload attached to the request.
- **`src/infrastructure/http/request.ts`** — `callerContextOf(request)` extracts the caller identity/context, forwarded to both `userService.updateById` and `userService.toUserContract`.
- **`src/modules/users/services/index.ts`** — Exports `userService`, which performs the domain work (`updateById`, `toUserContract`).
- **`src/modules/users/routes.ts`** — Wires `replaceUser` and `updateUser` into the route table for their respective HTTP methods.

## Notes

- `active` is **not** a writable field here. Activation/deactivation are separate endpoints (`POST /users/:id/activate`, `POST /users/:id/deactivate`); sending `active` in a PUT/PATCH body has no effect.
- `imageUrl` is listed in `keptWhenOmitted`: a `PUT` that omits the field preserves the existing avatar rather than clearing it.
- The controller is **versioned** (`versioned: true`), meaning responses carry a version stamp managed by the factory.
- The 404 error key is the i18n token `users.not-found`.
