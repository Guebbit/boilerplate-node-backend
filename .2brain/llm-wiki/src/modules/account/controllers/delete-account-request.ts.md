---
source: src/modules/account/controllers/delete-account-request.ts
sha256: 48401768c81fa6aa3c6de2832212191ec9c49a24beefc706439754dabaa904d0
generated_at: 2026-09-23T17:59:16.780539+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/delete-account-request.ts

## Purpose

Controller for `DELETE /account`. Given an authenticated user, it triggers the account-deletion confirmation flow (email with a one-time token) by delegating to `accountService`. The token itself is never exposed to the caller.

## Key elements

- **`deleteAccountRequest(request, response)`** — The sole export. Resolves the user by email from `request.authContext`, calls `accountService.requestAccountDeletion`, increments the `authAccountDeleteTotal` Prometheus counter (success/failure), and replies with a 200 `successResponse` carrying the i18n message `account.delete.email-sent`.
- **`catchAs(response, 'deleteAccountRequest')`** — Catches any thrown error in the promise chain and converts it to an HTTP error response (from `@infrastructure/http/controller`).

## Relationships

- **`@infrastructure/http/request`** — `callerContextOf(request)` extracts the caller's IP/UA context and passes it into `accountService.requestAccountDeletion`.
- **`@infrastructure/http/response`** — `successResponse` builds the 200 JSON envelope.
- **`@infrastructure/http/controller`** — `catchAs` provides the unified error-to-response adapter.
- **`@infrastructure/i18n`** — `t('account.delete.email-sent')` resolves the user-facing message in the request's language.
- **`@modules/users`** — `userService.findByEmail(email)` loads the user record before the deletion request is processed.
- **`@modules/account/services`** — `accountService.requestAccountDeletion(user, ctx)` performs the actual token minting and email dispatch.
- **`@modules/account/metrics`** — `authAccountDeleteTotal` counter (labels: `{ status: 'success' | 'failure' }`) is incremented on both paths.
- **`@modules/account/routes`** — Registers this controller as the handler for the `DELETE /account` route (behind `isAuth` middleware).
- **`@modules/account/tests/unit/delete-account.test.ts`** — Unit tests exercising the success, user-not-found, and error paths.

## Notes

- **Non-disclosure on missing user:** When `findByEmail` returns `null`, the controller still responds `200` with the same "email-sent" message (and increments a `failure` metric). This is intentional so an attacker cannot enumerate valid email addresses.
- **Auth guarantee:** `request.authContext!` uses a non-null assertion; the `isAuth` middleware is expected to have already populated it. There is no runtime guard in this file.
- **No body returned:** The response body is always `undefined` (generic `successResponse<undefined>`); the only variable is the localized message string.
- **Error path:** Any rejection from `accountService` (e.g. SMTP failure) flows into `catchAs`, which maps it to an appropriate HTTP error status — the `success` metric is **not** incremented.
