---
source: src/modules/users/controllers/update-user.ts
sha256: 7bc5607b870365451423cc609d907557a1112f312866d6113f2cf9d56035605a
generated_at: 2026-09-27T15:36:56.413351+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/update-user.ts

## Purpose

Defines the HTTP handlers for `PUT /users/:id` (full replace) and `PATCH /users/:id` (partial merge) by wiring the shared `createUpdateController` factory to `userService.updateById`. All business logic (field merging, audit, ban/unban split) lives in the service layer; this file only handles transport concerns.

## Key elements

- **`replaceUser`** — handler for `PUT /users/:id`; validates the body against `ReplaceUserByIdBody` (zod schema) before delegating to the service.
- **`updateUser`** — handler for `PATCH /users/:id`; validates against `UpdateUserByIdBody` (partial schema).
- Both are produced in a single `createUpdateController` call (entity `'user'`) and destructured as `replace` / `update`.
- **`update` callback** — calls `writeWithUploadedImage` to optionally persist a multipart avatar, then passes the merged `changes` + image data to `userService.updateById(id, …, callerContextOf(request))`.
- **`present` callback** — maps a domain user to its API contract via `userService.toUserContract(user)`.

## Relationships

- **`src/infrastructure/surfaces/create-update-controller.ts`** — provides the `createUpdateController` factory that produces the two handler objects from a config object.
- **`src/modules/users/service.ts`** — `userService.updateById` performs the actual update; `userService.toUserContract` shapes the response.
- **`src/infrastructure/http/uploads.ts`** — `writeWithUploadedImage` handles optional multipart image attachment before the service call.
- **`src/infrastructure/http/request.ts`** — `callerContextOf(request)` extracts the authenticated caller's identity for audit context.
- **`src/modules/users/routes.ts`** — registers `replaceUser` / `updateUser` as the route handlers (implied by the factory's purpose and the `@module` doc reference).

## Notes

- The `input: { booleans: ['active'] }` option tells the factory to coerce the string `"true"`/`"false"` that multipart form data sends for the `active` field into a real boolean before the schema sees it. Omit this if a future edit removes the avatar-upload path.
- The ban/unban split is **not** handled here; it is an internal concern of `userService.updateById`. Don't expect separate ban endpoints in this file.
