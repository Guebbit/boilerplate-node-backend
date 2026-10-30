---
source: src/modules/users/controllers/update-user.ts
sha256: 633aad1f52a0d0e2469a3b618b61cdd0ecf638672f27e0bb4b3e20bfbc3de65f
generated_at: 2026-10-29T06:12:06.182563+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/update-user.ts

## Purpose

Thin controller layer for `PUT /users/:id` (full replace) and `PATCH /users/:id` (partial merge). It delegates all business logic to `userService.updateById` and only handles HTTP concerns: schema validation, avatar upload, and response shaping.

## Key elements

- **`replaceUser`** — handler for `PUT /users/:id`. Validates the body against `ReplaceUserByIdBody`, then calls the shared update pipeline.
- **`updateUser`** — handler for `PATCH /users/:id`. Validates against `UpdateUserByIdBody`; only supplied fields are merged.
- **`createUpdateController({...})`** call — the single factory invocation that produces both handlers above. Notable config:
  - `versioned: true` — response includes an ETag/version stamp.
  - `keptWhenOmitted: ['imageUrl']` — a PUT that omits the avatar field preserves the existing one (clients can't "send back" a file they don't have).
  - `notFoundKey: 'users.not-found'` — i18n key for 404 responses.
  - `update` — wraps the write in `writeWithUploadedImage` so an incoming `imageUrl` part is persisted before `userService.updateById` is called.
  - `present` — serializes the domain user via `userService.toUserContract` scoped to the caller.

## Relationships

- **`src/infrastructure/surfaces/create-update-controller.ts`** — supplies the `createUpdateController` factory that wires validation, 404 handling, and the replace/patch dispatch into a ready-to-export handler pair.
- **`src/infrastructure/http/uploads.ts`** — `writeWithUploadedImage` handles multipart avatar extraction and storage; the controller calls it inside the `update` callback.
- **`src/infrastructure/http/request.ts`** — `callerContextOf(request)` extracts the authenticated caller, passed both to the service write and to the response presenter.
- **`src/modules/users/services/index.ts`** — `userService.updateById` performs the actual merge + audit; `userService.toUserContract` shapes the response DTO.
- **`src/modules/users/routes.ts`** — imports `replaceUser` / `updateUser` and binds them to the `PUT` and `PATCH` routes respectively.

## Notes

- The `active` boolean is **excluded** from both replace and patch bodies; activation/deactivation are separate endpoints (`POST /users/:id/activate`, `/deactivate`) and must not be attempted through this controller.
- `imageUrl` in the request body is not a URL string from the client — it is a multipart file part consumed by `writeWithUploadedImage`, which resolves it to a stored URL before passing `{ ...changes, ...image }` to the service.
- Both handlers are the result of a single `createUpdateController` call destructured as `{ replace, update }`; there is no standalone class or function to test in isolation.
