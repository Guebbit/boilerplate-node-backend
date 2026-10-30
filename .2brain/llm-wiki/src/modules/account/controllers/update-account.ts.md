---
source: src/modules/account/controllers/update-account.ts
sha256: 264e23a5cd117352038d14af89b138ac2fae18ef4f4870da4f4db6ac5c3e2f1f
generated_at: 2026-10-29T02:33:13.274795+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/update-account.ts

## Purpose

Defines the `PUT /account` (full replace) and `PATCH /account` (partial merge) endpoint handlers. Both operate exclusively on the authenticated caller's own record—the target id is never supplied by the client. The handlers are produced by the shared `createUpdateController` factory and delegate all business logic (field merging, email-verification flow, auditing) to `accountService.updateProfile`.

## Key elements

- **`replaceAccount`** — handler for `PUT /account`; accepts a `ReplaceAccountBody` and replaces the caller's profile fields.
- **`updateAccount`** — handler for `PATCH /account`; accepts an `UpdateAccountBody` and merges the supplied fields.
- **`idFrom`** — extracts the target id from `request.authContext.id`; the `!` assertion is safe because these routes are always mounted behind the `isAuth` guard.
- **`update` callback** — wraps the service call in `writeWithUploadedImage` so a multipart avatar upload is persisted first; then calls `accountService.updateProfile(id, mergedChanges, callerContext)`.
- **`present` callback** — shapes the response via `userService.toAccount(user, tenantRole)`; the role is read from the already-resolved auth context (no extra DB lookup).
- **`keptWhenOmitted: ['imageUrl']`** — a `PUT` that omits the avatar field preserves the existing image rather than nulling it.
- **`input.booleans: ['analyticsConsent']`** — coerces the single boolean field that arrives as a string in multipart form data.

## Relationships

- **`src/infrastructure/surfaces/create-update-controller.ts`** — provides the `createUpdateController` factory that assembles the two handlers from the config object in this file.
- **`src/infrastructure/http/request.ts`** — source of `callerContextOf`, used to build the audit-context argument passed to the service.
- **`src/infrastructure/http/uploads.ts`** — source of `writeWithUploadedImage`, which handles multipart image persistence before the service call.
- **`src/modules/account/services/index.ts`** — source of `accountService`; this file calls `updateProfile` with the merged changes and caller context.
- **`src/modules/users/index.ts`** — source of `userService`; used in the `present` callback to project the stored user into the account response shape.
- **`src/modules/account/routes.ts`** — mounts `replaceAccount` / `updateAccount` on the router behind the `isAuth` middleware (implied by the non-null `authContext` assertions).

## Notes

- Email-change side effects (pending-change record, fresh verification link) are owned by `accountService.updateProfile`, not by this controller. Do not add them here.
- The role is **never** mutated by a profile edit; it is read once from `request.authContext.roles.tenant` for presentation only.
- `imageUrl` is the only field that can arrive as a multipart file; all other fields are plain JSON. The `writeWithUploadedImage` wrapper is a no-op when no file part is present.
- The `versioned: true` flag on the factory config means responses include a version stamp—do not strip it when serializing.
