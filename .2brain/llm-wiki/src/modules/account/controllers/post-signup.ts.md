---
source: src/modules/account/controllers/post-signup.ts
sha256: a71330a4218857fe8124aa6b209dc62f791e00f6c85fd378411441b26dc12e7f
generated_at: 2026-09-23T18:04:05.883886+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-signup.ts

## Purpose

Thin HTTP controller for `POST /account/signup`. Delegates business logic to `accountService.signup`, then shapes the three possible outcomes (genuine success, rung-2 antibot refusal, or validation/DB failure) into consistent HTTP responses, ensuring uploaded images are cleaned up on every path where no account is persisted.

## Key elements

- **`postSignup(request, response)`** — the sole export. Destructures the request body (with empty-string defaults so `zodUserSchema` yields a translated 422 instead of a throw), reads the optional uploaded image, calls `accountService.signup`, then branches:
  - **Failure** (`!result.success`): deletes the upload, increments `authSignupTotal{status:"failure"}`, sends `rejectResponse`.
  - **Rung 2 refusal** (`data.isNew === true`): the service returned an unsaved Mongoose document; logs an antibot refusal, deletes the upload, and returns a **fabricated 201** byte-identical to a real signup (no `Set-Cookie`, no verification email).
  - **Success**: fires the verification email (fire-and-forget), issues a session via `issueSession`, and returns `successResponse<User>` with `SIGNUP_DEFAULT_ROLE`.

## Relationships

- **`@modules/account/services` (`accountService`, `sendVerificationEmail`)** — core business logic and post-signup email.
- **`@modules/account/session/session` (`issueSession`)** — mints the HTTP-only session cookie on success.
- **`@modules/account/metrics` (`authSignupTotal`)** — Prometheus counter incremented on every path (success / refusal / failure).
- **`@modules/access` (`SIGNUP_DEFAULT_ROLE`)** — hard-coded role placed in the response; avoids a DB lookup because self-service signup can only ever grant this one role.
- **`@modules/users` (`userService`)** — `toUser` mapper that shapes the Mongoose document into the public `User` shape.
- **`@infrastructure/http/uploads` (`readUploadedImage`)** — extracts `imageUrl`, `thumbnailUrl`, `pendingImageKey`, and the `deleteUpload` cleanup callback from the request.
- **`@infrastructure/http/response` (`successResponse`, `rejectResponse`)** — standard response helpers.
- **`@infrastructure/http/errors` (`rejectDatabaseError`)** — maps unexpected thrown errors to a safe 500 in the `.catch` branch.
- **`@infrastructure/http/request` (`callerContextOf`)** — derives caller metadata (IP, locale, etc.) passed to the service and email.
- **`@infrastructure/http/middlewares/antibot-log` (`logAntibotRefusal`)** — structured log entry for rung-2 fabrications.
- **`@types`** — `SignupRequest`, `SignupRequestMultipart`, `User` type definitions.

## Notes

- **Rung 2 indistinguishability:** the fabricated 201 uses `SIGNUP_DEFAULT_ROLE` (not a membership lookup, since the document was never saved) and omits `Set-Cookie`; the body is otherwise identical to a real signup. This prevents email-existence enumeration. Rung 2 is off by default; a 409 for an already-registered address already leaks existence.
- **Upload cleanup is best-effort:** `deleteUpload().catch(() => undefined)` appears on every non-success path so a rejected cleanup never becomes an unhandled rejection after the response is already sent.
- **Body defaults are deliberate:** `email`, `username`, `password`, `passwordConfirm`, `imageUrl` default to `''` and `termsAccepted` to `false` so that a missing body (Express 5 leaves `request.body` undefined when no parser matched) produces the same translated 422 as an empty-field body, rather than a crash.
- **No token in the body:** the response is `User`-shaped with cookies only; the frontend mints an access token via `GET /account/refresh`, same as after OAuth. This keeps rung 2's body byte-identical.
- **`data.isNew`** is the Mongoose flag distinguishing rung 2 (unsaved document) from a real registration; it is only meaningful because `signup` returns the document before `.save()` on the refusal path.
