---
source: src/modules/account/controllers/update-account.ts
sha256: 0ac61b3e79618bcc2254881e52ce2c64f5fd1bec392e1c0a3ada2568b52a8d43
generated_at: 2026-11-14T18:35:03.063493+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/update-account.ts

## Purpose

Implements the `PUT /account` (full replace) and `PATCH /account` (partial merge) handlers for the caller's own account record. Both are produced in one call to the shared `createUpdateController` factory. The handler never reads an `id` from the request; it always targets `request.authContext.id`. Email changes are explicitly excluded and handled by a separate `POST /account/email-change` endpoint.

## Key elements

- **`replaceAccount`** – `PUT /account` handler. Replaces the account profile with the full body validated against `ReplaceAccountBody` (with a `wellFormedLocale` check on `locale`).
- **`updateAccount`** – `PATCH /account` handler. Merges a partial body validated against `UpdateAccountBody` (same `locale` refinement).
- **`idFrom`** – Resolves the target id from `request.authContext.id`; the handler is guaranteed to run after the `isAuth` middleware.
- **`update` callback** – Delegates to `writeWithUploadedImage`, which streams any multipart avatar upload, then calls `accountService.updateProfile(id, changes, callerContext)`.
- **`present` callback** – Shapes the response via `accountUserService.toAccount(user, tenantRole)`, pulling the role straight from the already-resolved auth context.
- **`keptWhenOmitted: ['imageUrl']`** – A `PUT` that does not include `imageUrl` preserves the existing avatar rather than clearing it.
- **`input: { booleans: ['analyticsConsent'] }`** – Treats `analyticsConsent` as a string in multipart requests and coerces it to a boolean.

## Relationships

- **`src/infrastructure/surfaces/create-update-controller.ts`** — Provides the `createUpdateController` factory that wires validation, ID resolution, update, and response-shaping into a ready-made handler pair.
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf`, used to extract the caller context passed to the service call.
- **`src/infrastructure/http/uploads.ts`** — Supplies `writeWithUploadedImage`, which handles multipart avatar upload/streaming before the profile write.
- **`src/infrastructure/http/schemas.ts`** — Supplies `wellFormedLocale`, a Zod refinement applied to the `locale` field on both schemas.
- **`src/modules/account/services/index.ts`** — Exports `accountService`, the domain object whose `.updateProfile` method performs the actual merge and audit of the profile change.
- **`src/modules/users/friends/account.ts`** — Exports `accountUserService`, whose `.toAccount` method maps the stored user record into the API response shape using the tenant role.
- **`src/modules/account/routes.ts`** — Mounts `replaceAccount` and `updateAccount` on the `PUT`/`PATCH /account` routes (behind the `isAuth` guard).

## Notes

- **Email is intentionally absent.** Both `ReplaceAccountBody` and `UpdateAccountBody` reject an `email` key. Email changes follow a separate verification flow (`POST /account/email-change`); do not add it to these schemas.
- **No second role lookup.** The response `present` callback reads `request.authContext.roles.tenant` directly. A profile edit never changes the role, so a service-level re-fetch is unnecessary.
- **Multipart boolean quirk.** Clients that send `analyticsConsent` as part of a multipart (avatar) request will transmit it as the string `"true"`/`"false"`; the `input.booleans` config handles the coercion.
