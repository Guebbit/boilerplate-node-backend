---
source: src/modules/account/controllers/post-verify-confirm.ts
sha256: 2a165227f4018003dd245ea5b688ba617dc72430ccc3607f25e02d3bc3c8b494
generated_at: 2026-09-27T14:26:39.386462+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-verify-confirm.ts

## Purpose

Handles `POST /account/verify-confirm`: validates a one-time email-verification token submitted in the request body, redeems it, and marks the account's email as verified. The endpoint is intentionally public (no auth middleware) — the token in the body *is* the credential, following the same convention as `reset-confirm` and `delete-confirm`.

## Key elements

- **`postVerifyConfirm(request, response)`** — The sole export. A handler bound to the POST route that:
  1. Parses the body against `ConfirmEmailVerificationBody` (Zod schema from `@api/schemas.zod`); rejects with 422 on failure.
  2. Calls `accountService.redeemLiveToken(EMAIL_VERIFY_TOKEN_TYPE, token)` to atomically spend the token; a `null` return means the token was invalid or already consumed → 422.
  3. Calls `accountService.completeEmailVerification(user, callerContextOf(request))` to persist the verified flag, then responds 200.
  4. Increments the `authEmailVerifyTotal` Prometheus counter on every path (`status: 'success'` | `'failure'`).
  5. Routes unexpected exceptions through `catchAs(response, 'postVerifyConfirm')`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Provides `rejectValidation` (Zod error → 422) and `catchAs` (generic error → 500 logging/response) used in the validation and catch paths.
- **`src/infrastructure/http/request.ts`** — `callerContextOf(request)` extracts client metadata (IP, user-agent, etc.) passed to `completeEmailVerification` for audit logging.
- **`src/infrastructure/http/response.ts`** — `successResponse` and `rejectResponse` shape the JSON envelope for 200/422 replies.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — `t()` resolves user-facing messages (`account.verify.token-not-found`, `account.verify.success`) per the requester's locale.
- **`src/modules/account/services/index.ts`** — Exports `accountService` (token redemption + email verification) and the `EMAIL_VERIFY_TOKEN_TYPE` constant used to scope the token lookup.
- **`src/modules/account/metrics.ts`** — `authEmailVerifyTotal` counter; incremented on success and every failure branch.
- **`src/modules/account/routes.ts`** — Registers `postVerifyConfirm` on the `POST /account/verify-confirm` route (no auth guard).
- **`src/types/index.ts`** — Defines `VerifyEmailConfirmRequest` used as the typed body generic on the Express `Request`.

## Notes

- **Race safety by design.** Two simultaneous clicks both pass the token *lookup* (a read), but only one wins the atomic *spend*; the loser receives the same 422 "token not found" as a fabricated token. The find-and-spend logic lives in `services/tokens.ts`, not in this controller.
- **No auth middleware.** Do not add an auth guard here. The token in the body is the only credential, and the route is registered without one in `routes.ts`.
- **Metric is incremented in every branch** (validation failure, token-not-found, service success, unexpected throw). When adding new early-exit paths, keep the counter increment to avoid skewing the success-rate gauge.
