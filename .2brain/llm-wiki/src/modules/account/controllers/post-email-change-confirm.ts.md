---
source: src/modules/account/controllers/post-email-change-confirm.ts
sha256: c5672c140f6497fdc16a9815c81a2a6dca1f3b22106502ca5ecc3ba4bb3c3fe1
generated_at: 2026-09-23T18:01:53.464393+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-email-change-confirm.ts

## Purpose

HTTP controller for `POST /account/email-change-confirm`. It validates a one-time email-change token from the request body, spends it atomically (find-then-spend to avoid races), and promotes the caller's `pendingEmail` to `email`. The endpoint is intentionally public—the token itself is the credential, mirroring the design of the email-verify-confirm endpoint.

## Key elements

- **`postEmailChangeConfirm`** (exported function) — The sole handler. Parses the body against `ConfirmEmailChangeBody`, looks up a live `EMAIL_CHANGE_TOKEN_TYPE` token via `accountService.findLiveToken`, spends it with `accountService.spendLiveToken`, then calls `accountService.completeEmailChange`. Every refusal path returns a uniform `422` with a generic i18n message to prevent token enumeration.
- **`refuse()`** (local closure) — Centralised failure path: increments the failure metric and sends a `422` with the shared `account.email-change.token-not-found` message. Used for both "token not found" and "token already spent" cases so responses are indistinguishable.
- **`catchAs(response, 'postEmailChangeConfirm')`** — Catches downstream errors and derives the correct HTTP status (e.g. `409` for a unique-index collision when the new address is already claimed) instead of blanket-500'ing.

## Relationships

- **`@infrastructure/http/controller`** — Provides `rejectValidation` (Zod parse failures) and `catchAs` (error-to-status mapping).
- **`@infrastructure/http/request`** — Provides `callerContextOf` to pass the authenticated caller's identity into `completeEmailChange`.
- **`@infrastructure/http/response`** — Provides `successResponse` / `rejectResponse` for the two response shapes.
- **`@infrastructure/i18n`** — `t()` translates the success and refusal messages.
- **`@types`** — Imports `VerifyEmailConfirmRequest` as the typed request-body type (shared schema with the verify-confirm endpoint; Orval names the type after the shared Zod schema).
- **`../metrics`** — Increments `authEmailChangeConfirmTotal` on success, failure, and validation rejection.
- **`../services`** — Calls `accountService.findLiveToken`, `spendLiveToken`, and `completeEmailChange`; imports the `EMAIL_CHANGE_TOKEN_TYPE` constant.
- **`../routes`** — Registers this handler on the `POST /account/email-change-confirm` route.

## Notes

- **Token-type isolation:** A `verify`-type token will never match here because `findLiveToken` filters by `EMAIL_CHANGE_TOKEN_TYPE`. The two endpoints prove different things (old vs. new address) and must not cross-serve.
- **Race protection:** The find-then-spend sequence mirrors `postVerifyConfirm`; `spendLiveToken` returns a boolean so a concurrent duplicate request gets `refuse()` rather than a double-swap.
- **Derived status codes:** The `catch` block does _not_ hardcode 500. If the new address was claimed by another account between token issuance and confirmation, the DB unique-index rejection surfaces as a `409` via `catchAs`.
- **Shared request type:** The body shape (`{ token }`) is identical to the verify-confirm endpoint; the TypeScript type is imported as `VerifyEmailConfirmRequest` rather than a locally minted alias.
