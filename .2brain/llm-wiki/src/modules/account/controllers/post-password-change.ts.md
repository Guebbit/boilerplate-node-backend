---
source: src/modules/account/controllers/post-password-change.ts
sha256: 398cf08da82e9ec951890ea86fe1c0c85d1dd300dc65e93e5a3a276771720f2f
generated_at: 2026-09-23T18:03:04.826753+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-password-change.ts

## Purpose

HTTP controller for `POST /account/password`. Accepts a password-change request, validates the body shape, delegates the actual credential swap to `accountService.passwordChangeWithCurrent`, then re-mints the caller's session token. It exists as the thin Express adapter between the route and the account service.

## Key elements

- **`changePasswordShape`** — Zod schema built by extending `ChangePasswordBody` and overriding the three password fields with bare `z.string()`. Used only to verify the body has the expected keys; content rules (min-length, etc.) are intentionally excluded so the service can produce its own localized field-level errors.
- **`postPasswordChange(request, response)`** — The exported handler. Reads `request.authContext.id`, shape-parses the body, calls `accountService.passwordChangeWithCurrent`, and on success calls `issueSession` to hand back a fresh token. Emits `authPasswordChangeTotal` metrics on every path (success / failure / degraded).

## Relationships

- **`@infrastructure/http/response`** — `successResponse` and `rejectResponse` are the only ways this controller writes an HTTP reply.
- **`@infrastructure/http/controller`** — `rejectValidation` formats Zod shape errors into a standard 422 body.
- **`@infrastructure/http/errors`** — `rejectDatabaseError` maps unexpected thrown errors to a 500 with a stable error code.
- **`@infrastructure/http/request`** — `callerContextOf(request)` extracts locale/IP context forwarded to the service.
- **`@infrastructure/i18n`** — `t(...)` provides the localized success message string.
- **`@infrastructure/adapters/logger`** — `logger.warn` records a re-mint failure so the degrade-to-200 path is not silent.
- **`../services` (`accountService`)** — owns the business logic: verify current password, enforce content rules, write the new hash, revoke all other sessions.
- **`../session/session` (`issueSession`)** — signs a fresh auth token for the surviving session.
- **`../metrics` (`authPasswordChangeTotal`)** — Prometheus counter incremented on every outcome.
- **`@types`** — `ChangePasswordRequest` types the Express body; `AuthTokens` types the success payload.
- **`../routes.ts`** — registers `postPasswordChange` at the `POST /account/password` path (the controller itself contains no route definition).

## Notes

- **Two-layer validation is deliberate.** The controller checks *shape only* (keys present, values are strings). The service enforces *content* rules (length, complexity) and produces its own localized per-field errors. Merging the two layers would make the controller's generic Zod error shadow the service's specific copy.
- **Re-mint failure is a 200, not a 500.** By the time `issueSession` is called the password write and all-other-session revocation have already committed. Returning an error would mislead the client into retrying. The failure is logged and the response omits the token, but still says success.
- **`request.authContext!`** uses a non-null assertion. The `isAuth` middleware guarantees it is set; no runtime guard exists in this file.
- **`changePasswordShape` is derived from the contract schema.** If a new field is added to `ChangePasswordBody` in `@api/schemas.zod`, it automatically appears here as a required key — but its content rules are still stripped, so the service remains the authority on validation.
