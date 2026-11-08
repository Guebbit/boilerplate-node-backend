---
source: src/modules/account/controllers/post-email-change-confirm.ts
sha256: f2e7cd7252cef6233aa9936fd31180cba3db146437a71c22d9f1d7c62bd5b80c
generated_at: 2026-11-08T04:04:34.683475+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-email-change-confirm.ts

## Purpose

Controller for `POST /account/email-change/confirm`. Validates a one-time `email-change` token from the request body and delegates to the account service to promote `pendingEmail` into the active `email`. The endpoint is intentionally public—the token in the body is the credential, not a session.

## Key elements

- **`postEmailChangeConfirm`** (exported) — Express handler. Parses the body against `ConfirmEmailChangeBody`, calls `accountService.confirmEmailChange(token, callerContext)`, then either sends `204 No Content` (success), a `4xx` refusal, or a `5xx`/`409` via `catchAs`. Increments the `authEmailChangeConfirmTotal` counter (`success` | `failure`) on every code path.

## Relationships

- **`src/modules/account/services/index.ts`** — provides `accountService.confirmEmailChange`, which performs the token validation and email swap.
- **`src/infrastructure/http/controller.ts`** — supplies `parseBody` (schema validation + early 400), `refused` (maps a service "refused" result to the correct 4xx), and `catchAs` (maps thrown errors to the correct status, distinguishing 409 from 500).
- **`src/infrastructure/http/request.ts`** — `callerContextOf(request)` extracts the caller identity passed into the service.
- **`src/infrastructure/http/response.ts`** — `noContentResponse` sends the `204` on success.
- **`src/modules/account/metrics.ts`** — exports the `authEmailChangeConfirmTotal` Prometheus counter.
- **`src/types/index.ts`** — supplies `VerifyEmailConfirmRequest`, the shared `{ token }` body type (named after the `verify-confirm` schema; both endpoints accept the same shape).
- **`src/modules/account/routes.ts`** — wires this handler to the `POST /account/email-change/confirm` path.

## Notes

- **Shared type name is intentional.** `VerifyEmailConfirmRequest` is not a mistake; orval derives one type from the shared `{ token }` schema used by both `verify-confirm` and `email-change-confirm`.
- **Public by design.** No auth middleware is expected upstream. A `'verify'` token is explicitly refused by the service layer—token types are not interchangeable.
- **409 is a real outcome, not a bug.** If another account claims the target address between the email-change request and this confirm, the unique-index violation surfaces as a 409. `catchAs` differentiates this from a true 500; don't "fix" it into a blanket 500.
- **Return value is the promise chain**, not an `async` function. Callers (or test harnesses) that `await` the handler will resolve with the `Response` object (or `undefined` on the early-400 path where `parseBody` already wrote the response).
