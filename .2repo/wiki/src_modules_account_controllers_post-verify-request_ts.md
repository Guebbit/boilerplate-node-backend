# src/modules/account/controllers/post-verify-request.ts

## Purpose

Handler for `POST /account/verify-request`. Re-sends the email-verification link to the already-authenticated user (use case: the original signup email never arrived). Stateless with respect to *whether* verification is allowed — that decision is delegated entirely to the account service.

## Key elements

- **`postVerifyRequest(request, response)`** (exported) — the sole export. Reads the authenticated user's `id` via `authContextOf`, calls `accountService.requestEmailVerificationFor(id, callerContextOf(request))`, then either short-circuits through `refused()` or sends a `successResponse`. Failures are routed to `catchAs(response, 'postVerifyRequest')`.

## Relationships

- **`src/modules/account/routes.ts`** — registers this controller at the `POST /account/verify-request` path (implied by the doc-comment annotation).
- **`src/modules/account/services/index.ts`** — provides `accountService`, whose `requestEmailVerificationFor` performs the actual send and the state checks (account exists, not yet verified).
- **`src/infrastructure/http/request.ts`** — `authContextOf` extracts the verified user ID from the request; `callerContextOf` packages caller metadata for the service call.
- **`src/infrastructure/http/response.ts`** — `successResponse` formats the happy-path reply.
- **`src/infrastructure/http/controller.ts`** — `refused` inspects the service result and emits an error response if the action was denied; `catchAs` maps thrown errors to an HTTP error response, tagging the source as `'postVerifyRequest'`.

## Notes

- **Auth precondition:** the comment states `isAuth` middleware guarantees a valid auth context before this handler runs. No defensive auth check lives here.
- **Refusal vs. error:** the service can *refuse* (e.g., account already verified) — that is a business outcome handled by `refused()`, not an exception. Genuine failures (DB down, mail provider down) take the `.catch` path.
- **Promise style:** the handler uses `.then`/`.catch` rather than `async`/`await`, consistent with the rest of the controller layer.
- **Idempotency concern:** calling this repeatedly will keep re-sending the link (subject to whatever rate-limiting the service or infra applies). The controller itself imposes no throttle.
