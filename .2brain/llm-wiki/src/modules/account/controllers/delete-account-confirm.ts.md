---
source: src/modules/account/controllers/delete-account-confirm.ts
sha256: 54af1eaacdb5ec19d59c037e1e85e8d0ee5675d27b26da8f17145a8df589f2d3
generated_at: 2026-10-14T08:29:32.118792+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/delete-account-confirm.ts

## Purpose

Handler for `DELETE /account/delete-confirm`. It validates a one-time account-deletion token, redeems it through the account service, and performs a hard delete of the account. Exists as the terminal step of the two-step account-deletion flow (token issue → confirm).

## Key elements

- **`deleteAccountConfirm(request, response)`** — The sole export. Parses the request body against the `ConfirmAccountDeleteBody` Zod schema, redeems the token via `accountService.redeemLiveToken`, then calls `accountService.removeOwnAccount` on success. Destroys the session and "logged" cookies and returns a 200 with an i18n success message. On a missing/invalid token it logs the rejection and returns 422. Database-level failures are funnelled through `rejectDatabaseError` to avoid a flat 500.

## Relationships

- **`src/modules/account/services/index.ts`** — Provides `accountService` (token redemption, account removal, rejection logging) and the `ACCOUNT_DELETE_TOKEN_TYPE` constant used to scope the token lookup.
- **`src/modules/account/session/cookies.ts`** — `destroySessionCookie` and `destroyLoggedCookie` clear the caller's auth cookies after the account no longer exists.
- **`src/modules/account/routes.ts`** — Registers this function as the handler for the `DELETE /account/delete-confirm` route.
- **`src/infrastructure/http/controller.ts`** — Supplies `parseBody`, the shared Zod-body-validation helper that short-circuits with an error response on schema failure.
- **`src/infrastructure/http/response.ts`** — `successResponse` / `rejectResponse` wrap the standard JSON envelope for the 200 and 422 paths respectively.
- **`src/infrastructure/http/errors.ts`** — `rejectDatabaseError` inspects thrown errors and maps recognised database failures to appropriate HTTP statuses.
- **`src/infrastructure/http/request.ts`** — `callerContextOf(request)` extracts the caller identity/context forwarded to service-layer audit calls.
- **`src/infrastructure/i18n/index.ts`** (and `context.ts`) — `t()` resolves the human-readable messages for success and token-not-found responses.
- **`src/types/index.ts`** — Defines `AccountDeleteConfirmRequest`, the typed shape of the request body used in the Express generic.

## Notes

- The token is **spent on redemption**; a second call with the same token will 422.
- The "goodbye" email is sent by the service layer *before* the document is removed — the service is the only layer that can still read the address at that point (noted in an inline comment).
- `callerContextOf(request)` is passed into both the rejection-recording call and the removal call, so audit trails carry the caller even though the account is about to be deleted.
- `logger.ts` appears as a graph neighbor but is **not** imported here; logging is delegated entirely to the service layer.
