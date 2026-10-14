---
source: src/modules/account/controllers/post-email-change-confirm.ts
sha256: 1e5e4eb9b5a239271c3468267a2b71cc2251d2c086b22acf60dd1641efccb1d4
generated_at: 2026-10-14T08:34:01.870946+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-email-change-confirm.ts

## Purpose

HTTP controller for `POST /account/email-change-confirm`. It validates a one-time `email-change` token supplied in the request body, then delegates to the account service to spend that token and promote the caller's `pendingEmail` into the live `email` field. The endpoint is intentionally public (no session auth) because the token itself is the credential.

## Key elements

- **`postEmailChangeConfirm`** (exported function) — The sole export. Accepts Express `Request`/`Response`, runs Zod validation (`ConfirmEmailChangeBody`) on the body, then calls `accountService.redeemLiveToken(EMAIL_CHANGE_TOKEN_TYPE, token)`. On success it calls `accountService.completeEmailChange`; on a 409-class error (address already claimed) it still surfaces a structured rejection rather than a generic 500.

## Relationships

- **`@infrastructure/http/controller`** — Provides `rejectValidation` (Zod-failure short-circuit) and `catchAs` (typed error classification: 409 vs. 500, with logging).
- **`@infrastructure/http/response`** — `successResponse` / `rejectResponse` shape the JSON envelope and HTTP status.
- **`@infrastructure/http/request`** — `callerContextOf(request)` extracts an audit/trace context passed to the service and to `recordOneTimeTokenRejected`.
- **`@infrastructure/i18n`** — `t()` resolves user-facing message keys (`account.email-change.*`).
- **`@types`** — `VerifyEmailConfirmRequest` is the shared body type (also used by `verify-confirm`); the Zod schema is shared for the same reason, noted in an inline comment.
- **`../services`** — `accountService.redeemLiveToken`, `accountService.completeEmailChange`, `accountService.recordOneTimeTokenRejected`, and the `EMAIL_CHANGE_TOKEN_TYPE` constant all live here.
- **`../metrics`** — `authEmailChangeConfirmTotal` Prometheus counter is incremented on every code path (success / validation failure / token not found / thrown error).
- **`routes.ts`** (upstream) — Wires this controller to the `POST /account/email-change-confirm` route.
- **`@infrastructure/adapters/logger`** (transitive, via `catchAs`) — `catchAs` logs the classified error (409 vs. 500) before writing the response, so the logger is exercised on the failure path without a direct import here.

## Notes

- The token type filter is strict: a `verify` token will be rejected because `redeemLiveToken` matches on `EMAIL_CHANGE_TOKEN_TYPE`. The two token kinds prove different addresses and must not be interchangeable.
- "Find then spend" ordering mirrors `postVerifyConfirm` to handle the token-redeemed-race; the rationale is documented in `services/tokens.ts`.
- The 409 path (new address claimed by another account between token issuance and confirmation) is explicitly distinguished from a server error by `catchAs`; do not collapse it into a blanket 500.
- `ConfirmEmailChangeBody` (Zod) is imported from `@api/schemas.zod`, which is *not* a listed graph neighbor here but is the runtime schema counterpart to the shared `VerifyEmailConfirmRequest` type.
