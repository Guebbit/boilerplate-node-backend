---
source: src/modules/account/controllers/post-verify-confirm.ts
sha256: 0bfe31c36bfe8731b63660095f78894386244312a6d2d03660de8618dff1dd16
generated_at: 2026-09-23T18:04:15.649912+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-verify-confirm.ts

## Purpose

Handles `POST /account/verify-confirm`: validates a one-time email-verification token from the request body, atomically spends it, and marks the account's email as verified. The endpoint is deliberately public (no session required) because the token in the body is the credential.

## Key elements

- **`postVerifyConfirm(request, response)`** — The sole export. Validates the body against `ConfirmEmailVerificationBody` (Zod), then runs a find-then-spend sequence on `accountService` to claim the token and complete verification.
- **`refuse()` closure** — Single point of failure response: increments the failure metric and returns `422` with the `account.verify.token-not-found` i18n string. Used for every refusal path (token absent, already spent, etc.) so callers cannot distinguish which check failed.
- **`authEmailVerifyTotal`** — Prometheus-style counter (`{ status: 'success' | 'failure' }`) incremented on every outcome.

## Relationships

- **`routes.ts`** — Registers `postVerifyConfirm` as the handler for the `POST /account/verify-confirm` route.
- **`services/index.ts`** — Supplies `accountService` (which exposes `findLiveToken`, `spendLiveToken`, `completeEmailVerification`) and the `EMAIL_VERIFY_TOKEN_TYPE` constant.
- **`controller.ts`** — Provides the `rejectValidation` helper (Zod parse-error shape) and `catchAs` (unified error → HTTP mapping).
- **`request.ts`** — `callerContextOf(request)` extracts the caller's IP/user-agent context, forwarded to `completeEmailVerification`.
- **`response.ts`** — `successResponse` / `rejectResponse` shape the final JSON reply.
- **`i18n/index.ts` / `i18n/context.ts`** — `t()` localizes both the success message and the token-not-found error.
- **`types/index.ts`** — `VerifyEmailConfirmRequest` types the Express generic parameter for the body.
- **`metrics.ts`** — Defines the `authEmailVerifyTotal` counter used throughout.

## Notes

- **Race safety lives in the service, not here.** Two simultaneous clicks both pass `findLiveToken`; only the atomic `spendLiveToken` picks a winner. The loser hits the same `refuse()` path as a fabricated token, so the API never leaks "token exists but is spent" vs. "token does not exist."
- **All failure responses are identical** (same status code, same i18n key) by design—see the note in `services/tokens.ts`. Do not add per-case error messages here.
- The controller uses promise chains (`.then`) rather than `async/await`; keep that style consistent if editing.
