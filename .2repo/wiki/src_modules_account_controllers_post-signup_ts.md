# src/modules/account/controllers/post-signup.ts

## Purpose

The sole controller for `POST /account/signup`. It accepts a JSON or multipart (file-upload) signup body, delegates registration to `accountService.signup`, handles avatar image cleanup on failure, emits a Prometheus counter, and fires a verification email after a successful 201.

## Key elements

- **`postSignup`** (exported) — The Express request handler. Destructures `email`, `username`, `password`, `passwordConfirm` from `request.body`; resolves an avatar image (uploaded file takes priority over a body-supplied `imageUrl`); calls `accountService.signup`; on success responds **201** via `successResponse` and fires `sendVerificationEmail` (fire-and-forget); on failure or Mongoose `CastError` removes the uploaded image, increments the failure metric, and responds with an appropriate error.
- **`deleteUpload`** (closure) — Calls `imageStore.remove(imageUrlFile)`. Deliberately targets only the file this request uploaded, not the merged `imageUrl`, so a body-supplied URL (another user's asset) is never deleted.
- **`authSignupTotal.inc({ status })`** — Prometheus counter (from `../metrics`) tagged `'success'` or `'failure'`, incremented on every terminal path.
- **`callerContextOf(request)`** — Extracted from the inbound request and forwarded into both `signup` and `sendVerificationEmail` as locale/audit context.

## Relationships

- **`src/modules/account/services/index.ts`** — Source of `accountService` (performing the actual signup) and `sendVerificationEmail`.
- **`src/modules/account/routes.ts`** — Wires `postSignup` to the `POST /account/signup` route (this file is the route's handler).
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` / `rejectResponse` for all terminal HTTP replies.
- **`src/infrastructure/http/uploads.ts`** — `resolveImageUrl` extracts a multipart upload from the request.
- **`src/infrastructure/adapters/image-store.ts`** — `imageStore.remove` is the cleanup call when signup fails.
- **`src/infrastructure/http/errors.ts`** — `rejectDatabaseError` formats Mongoose `CastError` / generic `Error` into the standard error envelope.
- **`src/infrastructure/http/request.ts`** — `callerContextOf` pulls locale/audit metadata off the request.
- **`src/types/index.ts`** — `SignupRequest` and `SignupRequestMultipart` shape the Express typed body.
- **`src/modules/account/services/verification.ts`** — Implementation of `sendVerificationEmail`; reached indirectly through the services index import.

## Notes

- **No Zod validation at the controller layer is deliberate.** `accountService.signup` validates via `zodUserSchema` with localized (dictionary) error messages. Running a generated Zod schema here would respond first in untranslated English, which `tests/integration/locale.test.ts` explicitly forbids. One endpoint must not double-validate.
- **`sendVerificationEmail` is `void`-fired.** The 201 is returned before the email task completes; the account is fully functional regardless of `verified` status.
- **Password stripping relies on Mongoose's `toJSON` transform.** The in-memory document returned by `create()` still carries the hash; the transform removes it before `res.json` serializes. Do not bypass by returning a raw object.
- **Image cleanup is tied to `imageUrlFile`, not `imageUrl`.** If the body supplied an `imageUrl` and the upload also succeeded, only the upload is deleted on failure — the body URL may reference another user's asset.
