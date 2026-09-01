# src/modules/account/controllers/put-account.ts

## Purpose

HTTP handler for `PUT /account`: lets an authenticated user update their own profile (email, username, locale, image, phone, website). It is a thin adapter over `accountService.updateProfile`, plus two side-effects that accompany a self-service edit — uploaded-image cleanup on failure and a re-verification email when the address changes. It exists as a separate self-service path because the `/users` write routes are admin-gated.

## Key elements

- **`putAccount`** (exported) — The sole export; an Express `(request, response) => void` handler. Reads auth context, extracts uploaded-image fields, delegates to `accountService.updateProfile`, triggers re-verification if email changed, and responds with a localized success/failure payload.

## Relationships

- **`routes.ts`** (same module) — registers `putAccount` as the handler for the `PUT /account` route behind the `isAuth` middleware.
- **`services/index.ts`** / **`services/verification.ts`** — `accountService.updateProfile` performs the actual persistence and validation; `sendVerificationEmail` is fired (fire-and-forget) when the email address changes.
- **`@infrastructure/adapters/image-store.ts`** — `readUploadedImage` pulls `imageUrl`, `thumbnailUrl`, `pendingImageKey`, and the `deleteUpload` cleanup callback out of the (possibly multipart) request.
- **`@infrastructure/http/request.ts`** — `authContextOf` yields the caller's `id` and current `email`; `callerContextOf` packages locale/context for the service layer.
- **`@infrastructure/http/response.ts`** — `successResponse` / `rejectResponse` shape the HTTP replies.
- **`@infrastructure/http/errors.ts`** — `rejectDatabaseError` translates Mongoose `CastError` and generic errors into a consistent 4xx/5xx body.
- **`@infrastructure/i18n`** — `t('account.update.success')` supplies the localized success message.
- **`@types`** — `UpdateAccountRequest` and `UpdateAccountRequestMultipart` describe the two body shapes (JSON vs. multipart).

## Notes

- **No `imageUrl = ''` default.** Unlike the create paths, an absent `imageUrl` is passed through as `undefined`, which `updateProfile` interprets as "not sent" and leaves the stored value intact. Defaulting to `''` would *clear* the existing image.
- **Body is cast, not re-parsed.** `request.body as UpdateAccountRequest` is intentional: `updateProfile` validates fields with its own translated messages. Parsed through a generated schema first, the schema would reject in English before the service's (potentially localized) validation runs.
- **Re-verification is fire-and-forget.** `void sendVerificationEmail(...)` does not block the HTTP response; the email goes to the *new* address, proving the mailbox that now backs the account.
- **`deleteUpload` runs on both failure and error paths** (`.then` rejection branch and `.catch`), ensuring the uploaded file is removed whenever the update does not succeed.
- **Auth is assumed, not checked here.** The `isAuth` middleware (wired in `routes.ts`) guarantees the token is valid; the controller simply reads the context.
