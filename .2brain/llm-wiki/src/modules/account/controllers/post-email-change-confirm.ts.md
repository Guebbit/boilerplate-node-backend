---
source: src/modules/account/controllers/post-email-change-confirm.ts
sha256: 7dc7f5e171887aa7523e6e1b207ef472320a53419c69390d9b712334b28d3c97
generated_at: 2026-09-27T14:24:21.086906+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-email-change-confirm.ts

## Purpose

Handles `POST /account/email-change-confirm`. It validates a one-time `email-change` token in the body, spends it via `accountService.redeemLiveToken`, and then commits the pending email to the user's `email` field via `accountService.completeEmailChange`. The endpoint is deliberately public: the token itself is the credential, not an authenticated session.

## Key elements

- **`postEmailChangeConfirm`** (exported const) — the sole controller. Accepts `Request<unknown, unknown, VerifyEmailConfirmRequest>` / `Response`, parses the body with `ConfirmEmailChangeBody.safeParse`, then chains `redeemLiveToken` → `completeEmailChange`, emitting `authEmailChangeConfirmTotal` metrics (`success` / `failure`) at each terminal path.
- **`ConfirmEmailChangeBody`** (imported from `@api/schemas.zod`) — Zod schema for `{ token }`. Shared with the verify-confirm endpoint; the request *type* is therefore the shared `VerifyEmailConfirmRequest`, not a separate one.
- **`EMAIL_CHANGE_TOKEN_TYPE`** (imported from `../services`) — the token-type discriminator passed to `redeemLiveToken`. A `verify`-type token will never match this filter, so the two confirm endpoints cannot cross-contaminate.

## Relationships

- **`src/infrastructure/http/controller.ts`** — supplies `rejectValidation` (400 on Zod failure) and `catchAs` (error-dispatching helper that logs and maps errors to the correct HTTP status).
- **`src/infrastructure/http/request.ts`** — supplies `callerContextOf(request)`, forwarded into `completeEmailChange` so the service can record the acting identity.
- **`src/infrastructure/http/response.ts`** — supplies `successResponse` and `rejectResponse` for the 200 / 422 paths.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — supplies the `t()` translator used for all user-facing messages (`account.email-change.token-not-found`, `account.email-change.success`).
- **`src/modules/account/metrics.ts`** — supplies `authEmailChangeConfirmTotal`, an OpenMetrics counter incremented on every terminal outcome.
- **`src/modules/account/services/index.ts`** — supplies `accountService` (the domain service performing the actual token redemption and email swap) and the `EMAIL_CHANGE_TOKEN_TYPE` constant.
- **`src/modules/account/routes.ts`** — wires this controller to the `POST /account/email-change-confirm` path.
- **`src/types/index.ts`** — source of the `VerifyEmailConfirmRequest` type (the shared body shape).

## Notes

- **Public by design.** No auth middleware; the body token *is* the credential. Do not add a session/auth guard.
- **Shared schema, shared type.** `ConfirmEmailChangeBody` and `VerifyEmailConfirmRequest` are also used by the verify-confirm controller. Changing the schema here affects that endpoint too.
- **Race-safety pattern.** `redeemLiveToken` does find-then-spend atomically (see `services/tokens.ts`). Do not split it into a separate SELECT + UPDATE in this controller.
- **Error mapping is not a blanket 500.** `catchAs` distinguishes a unique-index rejection (409, e.g. the new address was claimed by another account between the request and the confirm) from a true server error (500) and logs accordingly. Avoid replacing `catchAs` with a generic `.catch` that hard-codes 500.
- **Metric label is binary.** Only `'success'` and `'failure'` are used; there is no `'invalid'` label. A Zod parse failure and a token-not-found both increment `'failure'`.
