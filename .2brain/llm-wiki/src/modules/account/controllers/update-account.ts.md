---
source: src/modules/account/controllers/update-account.ts
sha256: 525a21c5e32a4a60fa4ccea884e561a719a51a199ff9d89445d62741604818a8
generated_at: 2026-10-14T08:38:10.776066+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/update-account.ts

## Purpose

Defines the `PUT /account` (full replace) and `PATCH /account` (partial merge) handlers. Both operate exclusively on the authenticated caller's own account record—there is no entity ID in the request body. The file is a thin wiring layer: it configures the shared `createUpdateController` factory with schemas, input-parsing rules, and the service call, then delegates the actual profile mutation (including the email pending-change flow and audit logging) to `accountService.updateProfile`.

## Key elements

- **`replaceAccount`** – `PUT /account` handler. Full replacement of the account record using `ReplaceAccountBody`.
- **`updateAccount`** – `PATCH /account` handler. Partial merge using `UpdateAccountBody`.
- Both are produced in a single `createUpdateController` call with:
  - `versioned: true` — response envelope carries a version token.
  - `input.booleans: ['analyticsConsent']` — the only boolean field sent as a string over multipart.
  - `keptWhenOmitted: ['imageUrl']` — a PUT that omits `imageUrl` preserves the existing avatar (clients cannot echo it back).
  - `idFrom` — always resolves to `request.authContext!.id` (guaranteed by the `isAuth` middleware upstream).
  - `update` — wraps the service call in `writeWithUploadedImage`, passing the resolved image data and `callerContextOf(request)` to `accountService.updateProfile`.
  - `present` — shapes the response via `userService.toUser(user, request.authContext!.roles.tenant)`, reusing the already-resolved tenant role from auth context (no extra lookup).

## Relationships

- **`src/infrastructure/surfaces/create-update-controller.ts`** — provides the `createUpdateController` factory that this file configures; the factory enforces the replace/patch pair, input coercion, and the `idFrom` → `update` → `present` pipeline.
- **`src/infrastructure/http/request.ts`** — supplies `callerContextOf`, used to forward the caller's context into the service layer.
- **`src/infrastructure/http/uploads.ts`** — supplies `writeWithUploadedImage`, which handles the multipart avatar write and resolves the final image reference before calling the service.
- **`src/modules/account/services/index.ts`** — source of `accountService.updateProfile`, the actual business-logic method (field merge, email pending flow, audit).
- **`src/modules/users/index.ts`** / **`src/modules/users/services/index.ts`** — source of `userService.toUser`, which projects the account row into the public user shape for the response body.
- **`src/modules/account/routes.ts`** — mounts `replaceAccount` and `updateAccount` onto the `PUT`/`PATCH /account` endpoints behind the `isAuth` guard.

## Notes

- The email-change side effects (pending-change notice, new verification link) are owned by `accountService.updateProfile`, not this controller. Do not add email logic here.
- `request.authContext` is asserted non-null (`!`) in both `idFrom` and `present`; this is safe only because the routes file always places `isAuth` before these handlers. If routes change, the assertion breaks silently at runtime.
- The `imageUrl` field is deliberately excluded from `keptWhenOmitted` semantics on PATCH (where omission already means "no change") but is listed for PUT, where omission would otherwise clear the avatar.
