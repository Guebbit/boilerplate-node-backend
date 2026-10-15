---
source: src/modules/account/controllers/post-email-change-confirm.ts
sha256: 68fef9797ae71668e12020a06be673dafd6cc1436d08b160121f1080731c4e24
generated_at: 2026-10-15T09:54:38.359904+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-email-change-confirm.ts

## Purpose

Handler for `POST /account/email-change-confirm`. It validates a one-time `email-change` token from the request body and delegates to the account service to swap the caller's `pendingEmail` into `email`. The endpoint is deliberately public: the token in the body *is* the credential, analogous to `verify-confirm`.

## Key elements

- **`postEmailChangeConfirm`** (exported) — The sole handler. Parses the body with `ConfirmEmailChangeBody.safeParse`, then calls `accountService.confirmEmailChange(token, callerContext)`. On refusal it returns early; on success it sends a `successResponse`. Errors are routed through `catchAs` so a 409 (address already claimed) is distinguished from a true 500.
- **`ConfirmEmailChangeBody`** (imported from `@api/schemas.zod`) — Zod schema for the `{ token }` body. Shared with the `verify-confirm` endpoint.
- **`authEmailChangeConfirmTotal`** (imported from `../metrics`) — Prometheus counter incremented with `status: 'success' | 'failure'` on every code path.

## Relationships

- **`src/modules/account/routes.ts`** — Registers this handler on the `POST /account/email-change-confirm` route.
- **`src/modules/account/services/index.ts`** — Provides `accountService.confirmEmailChange`, the business logic that spends the token and performs the swap.
- **`src/modules/account/metrics.ts`** — Source of the `authEmailChangeConfirmTotal` counter.
- **`src/infrastructure/http/controller.ts`** — Supplies `rejectValidation`, `refused`, and `catchAs` helpers used for the three response branches.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf` to extract the authenticated caller's identity from the request.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` for the happy-path reply.
- **`src/types/index.ts`** — Source of the `VerifyEmailConfirmRequest` type (orval names it after the shared schema; both confirm endpoints accept the same `{ token }` shape).
- **`src/infrastructure/adapters/logger.ts`** — Indirectly reached through `catchAs`, which logs whichever error category actually fired.

## Notes

- The request generic uses `VerifyEmailConfirmRequest`, not a dedicated type. This is intentional: orval names the type after the shared Zod schema that both confirm endpoints use, so there is no second type to maintain.
- A `'verify'` token passed to this endpoint is explicitly refused at the service layer; the two token kinds must not substitute for each other.
- The 409-vs-500 distinction is load-bearing: if the new email is claimed by another account *after* the token was issued but *before* this confirm runs, the unique-index rejection is a legitimate 409, not a server fault. `catchAs` is what makes that distinction; do not replace it with a blanket `catch` that returns 500.
