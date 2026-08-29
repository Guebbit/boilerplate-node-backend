# src/modules/account/controllers/put-account.ts

## Purpose

Handler for `PUT /account` — the self-service endpoint that lets an authenticated user edit their own profile (email, username, locale, avatar image). It exists because admin-only `/users` write routes return 403 to regular users, so this is the sole path for non-admin profile updates.

## Key elements

- **`putAccount`** (exported function) — Express handler accepting `Request<unknown, unknown, UpdateAccountRequest | UpdateAccountRequestMultipart>`. Reads the caller's `id` and current `email` from `authContextOf`, merges a file-upload image URL (via `resolveImageUrl`) with a body-supplied `imageUrl`, then delegates to `accountService.updateProfile`. On success with a changed email, fires `sendVerificationEmail` (fire-and-forget, `void`-ed). On failure or error, calls `imageStore.remove(imageUrlFile)` to delete only the image *this* request uploaded.

## Relationships

- **`src/modules/account/services/index.ts`** — calls `accountService.updateProfile(id, { email, username, locale, imageUrl }, callerContext)` and `sendVerificationEmail(result.data, callerContext)`.
- **`src/modules/account/services/verification.ts`** — source of `sendVerificationEmail`; invoked asynchronously when the email field changes.
- **`src/modules/account/routes.ts`** — registers `putAccount` as the handler for the `PUT /account` route (implied by the doc comment).
- **`src/infrastructure/http/request.ts`** — provides `authContextOf` (user id + email) and `callerContextOf` (i18n/locale context passed to services).
- **`src/infrastructure/http/response.ts`** — provides `successResponse` and `rejectResponse` for all HTTP replies.
- **`src/infrastructure/http/errors.ts`** — provides `rejectDatabaseError` used in the `.catch` branch.
- **`src/infrastructure/http/uploads.ts`** — provides `resolveImageUrl` to extract a URL from a multipart file upload.
- **`src/infrastructure/adapters/image-store.ts`** — `imageStore.remove` cleans up the newly uploaded file when the update fails.
- **`src/infrastructure/i18n/index.ts`** — `t('account.update.success')` supplies the translated success message.
- **`src/types/index.ts`** — `UpdateAccountRequest` and `UpdateAccountRequestMultipart` define the body shapes.

## Notes

- **Image cleanup is intentionally narrow.** `deleteUpload` removes only `imageUrlFile` (the file this request uploaded). If the client sent a body `imageUrl` instead, no file was created here, so nothing is deleted.
- **Validation is done inside `accountService.updateProfile`, not by a generated schema.** The body is read via the `UpdateAccountRequest` type cast so that service-level validation (with translated error messages) is what surfaces to the client, rather than an English-language schema rejection.
- **Verification email is fire-and-forget.** The `void` keyword ensures the HTTP response does not wait on the email queue; a delivery failure does not fail the update request.
- **The `email` comparison** (`email !== currentEmail`) gates verification re-sending: `updateProfile` already unsets the `verified` flag internally, so the controller only needs to dispatch the new link.
