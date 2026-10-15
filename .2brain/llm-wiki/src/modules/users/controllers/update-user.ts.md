---
source: src/modules/users/controllers/update-user.ts
sha256: 30054aeacaf82d271bab8bde248d78509b4b202238b848a7d77d87a2dad6f294
generated_at: 2026-10-15T12:07:29.849465+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/update-user.ts

## Purpose

Builds the `PUT /users/:id` (full replace) and `PATCH /users/:id` (partial merge) HTTP handlers for the users module by calling the shared `createUpdateController` factory. All domain logic is delegated to `userService`; this file only wires schemas, input coercion, avatar-upload handling, and response shaping.

## Key elements

- **`replaceUser`** – Destructured export for the `PUT` handler. Validates the body against `ReplaceUserByIdBody`, merges the supplied fields, and persists via `userService.updateById`.
- **`updateUser`** – Destructured export for the `PATCH` handler. Validates against `UpdateUserByIdBody` and applies a partial update through the same service method.
- **`createUpdateController({ … })`** – Configuration object passed to the shared factory:
  - `versioned: true` – includes a version stamp in the response.
  - `notFoundKey: 'users.not-found'` – i18n key used when the user doesn't exist.
  - `input: { booleans: ['active'] }` – coerces the `active` field from a multipart string to a real boolean.
  - `keptWhenOmitted: ['imageUrl']` – preserves the existing avatar on a `PUT` that doesn't supply one (the client cannot read the current URL back).
  - `update(id, changes, request)` – delegates to `userService.updateById`, wrapping the call in `writeWithUploadedImage` so a multipart avatar is streamed to storage and its resulting metadata merged into the changes object.
  - `present(user, request)` – shapes the stored entity into the public contract via `userService.toUserContract`.

## Relationships

- **`src/infrastructure/surfaces/create-update-controller.ts`** – Provides the `createUpdateController` factory that generates the two handler functions from the config object defined here.
- **`src/modules/users/services/index.ts`** – Supplies `userService.updateById` (persistence + audit) and `userService.toUserContract` (response shaping).
- **`src/infrastructure/http/uploads.ts`** – `writeWithUploadedImage` streams an uploaded avatar to object storage and returns metadata merged into the update payload.
- **`src/infrastructure/http/request.ts`** – `callerContextOf(request)` extracts the authenticated caller's context, passed into `updateById` for audit logging.
- **`src/modules/users/routes.ts`** – Imports `replaceUser` / `updateUser` and mounts them on the `PUT` and `PATCH` routes for `/users/:id`.

## Notes

- `imageUrl` appears in **both** schemas but is treated specially: on a `PUT` (replace) it is kept if omitted; on a `PATCH` (merge) it is naturally optional. The factory's `keptWhenOmitted` array encodes this asymmetry.
- The `active` field arrives as a string when the request is multipart (avatar upload); the `booleans` coercion list handles only that one field—other booleans are expected to already be typed correctly by the schema.
- Both handlers funnel through the **same** service method (`updateById`); the replace-vs-merge distinction is enforced entirely by the Zod schema (`ReplaceUserByIdBody` vs. `UpdateUserByIdBody`) before the handler runs.
