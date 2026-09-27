---
source: src/modules/account/controllers/update-account.ts
sha256: 53eea789632dfb47bccac66478c1a0fa04c5bf768af6d1f7947517a5327eaaff
generated_at: 2026-09-27T14:26:49.246614+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/update-account.ts

## Purpose

Defines the `PUT /account` (replace) and `PATCH /account` (merge) handlers for the caller's own account record. Both delegate to `accountService.updateProfile` via the shared `createUpdateController` factory, so this file is purely wiring—no business logic lives here.

## Key elements

- **`replaceAccount`** – handler for `PUT /account`; accepts a full `ReplaceAccountBody` and replaces the caller's profile fields.
- **`updateAccount`** – handler for `PATCH /account`; accepts a partial `UpdateAccountBody` and merges changes into the caller's profile.
- Both are destructured from a single `createUpdateController({ … })` call; the factory wires up schema validation, id resolution, and the update/present callbacks.

## Relationships

- **`createUpdateController`** (infrastructure/surfaces) – factory that produces the `replace`/`update` pair; this file supplies the entity name, schemas, `idFrom`, `update`, and `present` callbacks.
- **`accountService`** (modules/account/services) – invoked inside the `update` callback to perform the actual profile mutation (including the `pendingEmail` flow and audit logging).
- **`userService`** (modules/users) – used in the `present` callback to shape the response via `toUser`, passing the caller's tenant role from the auth context.
- **`callerContextOf`** (infrastructure/http/request) – extracts a caller-context object from the request, forwarded to `accountService.updateProfile`.
- **`writeWithUploadedImage`** (infrastructure/http/uploads) – wraps the update call to persist an optional multipart avatar upload (`changes.imageUrl`) and merge the resulting image data into the changes object.
- **`routes.ts`** (modules/account) – mounts these two handlers; the non-null assertion on `authContext!` is safe only because routes guarantee the `isAuth` middleware runs first.

## Notes

- **No id in the request body.** The target account is always `request.authContext.id`; there is no user-supplied identifier.
- **`analyticsConsent` is the sole string-encoded boolean.** It arrives as `"true"`/`"false"` in multipart (avatar) uploads, hence the explicit `input.booleans` declaration.
- **Email side-effects are not this controller's concern.** The pending-change notice and verification link are triggered inside `accountService.updateProfile` (see `docs/modules/account.md#proving-an-address`).
- **Role is read-only here.** It is taken from the already-resolved `authContext.roles.tenant`; a profile edit never mutates it, so no second service lookup occurs.
