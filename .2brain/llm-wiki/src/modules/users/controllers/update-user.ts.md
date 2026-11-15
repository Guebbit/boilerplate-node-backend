---
source: src/modules/users/controllers/update-user.ts
sha256: 64aacbc5608c53315423c8db5be1a1ea009edcc4b749e91bdfac4acc145c50d0
generated_at: 2026-11-14T22:21:52.526203+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/update-user.ts

## Purpose

Defines the HTTP handler pair for `PUT /users/:id` (full replace) and `PATCH /users/:id` (partial merge). Both delegate to `userService.updateById`, which performs the field merge and audit internally. The file exists as the thin presentation-layer binding between the route table and the user service, adding locale validation, image-upload handling, and response shaping.

## Key elements

- **`replaceUser`** — handler for `PUT /users/:id`. Validates the body against `ReplaceUserByIdBody` (with extended locale check), then calls the update service.
- **`updateUser`** — handler for `PATCH /users/:id`. Validates against `UpdateUserByIdBody` (with extended locale check), then calls the same service.
- Both are produced by a single `createUpdateController({ … })` call with:
  - `versioned: true` — opts into versioned response envelopes.
  - `notFoundKey: 'users.not-found'` — i18n key for 404 responses.
  - `keptWhenOmitted: ['imageUrl']` — a PUT that omits `imageUrl` preserves the existing avatar rather than clearing it.
  - `update` callback — wraps the service call in `writeWithUploadedImage` so an optional avatar upload is persisted before the field is applied.
  - `present` callback — maps the domain user to its API contract via `userService.toUserContract`, passing the caller identity for permission-aware serialization.

## Relationships

- **`src/infrastructure/surfaces/create-update-controller.ts`** — provides the `createUpdateController` factory that produces the `replace`/`update` handler pair from the options object.
- **`src/modules/users/services/index.ts`** — exports `userService`; this controller calls `updateById` and `toUserContract` on it.
- **`src/infrastructure/http/request.ts`** — `callerContextOf(request)` extracts the authenticated caller context passed into service calls.
- **`src/infrastructure/http/uploads.ts`** — `writeWithUploadedImage` persists an optional multipart image before the update is committed.
- **`src/infrastructure/http/schemas.ts`** — `wellFormedLocale` supplies the locale validation rule extended onto both request schemas.
- **`src/modules/users/routes.ts`** — registers `replaceUser` and `updateUser` on the `PUT`/`PATCH /users/:id` routes.

## Notes

- `active` is intentionally **not** part of the replace/patch body; activation and deactivation are separate `POST /users/:id/activate` / `/deactivate` endpoints. Do not add `active` to the schemas here.
- `imageUrl` is listed in `keptWhenOmitted`, meaning a full-replace PUT that simply omits the field will **not** clear the stored avatar. To remove an avatar, a client must explicitly send a falsy/empty value (subject to the service's handling).
- The locale field on both schemas is re-validated with `wellFormedLocale`, overriding whatever base constraint `ReplaceUserByIdBody` / `UpdateUserByIdBody` define.
- The update is versioned; responses carry a version envelope in addition to the user contract.
