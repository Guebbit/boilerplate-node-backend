---
source: src/modules/account/controllers/post-verify-confirm.ts
sha256: a21d4cfb9240f6eac29532330da79efd35bd7e646933b82bc4ec5321c254d036
generated_at: 2026-10-15T09:56:27.215823+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-verify-confirm.ts

## Purpose

HTTP controller for `POST /account/verify-confirm`. It validates a one-time verification token from the request body, delegates the actual email-verification spend to the account service, and returns a structured success/failure response. Exists as the thin transport layer in the route → controller → service pipeline for email verification confirmation.

## Key elements

- **`postVerifyConfirm`** (exported function) — The sole export. Accepts Express `Request`/`Response`. Pipeline:
  1. `ConfirmEmailVerificationBody.safeParse(request.body)` — Zod validation; on failure calls `rejectValidation` and returns.
  2. `accountService.confirmEmailVerification(token, callerContextOf(request))` — the only business call; service owns the find-then-spend logic.
  3. Success path → `successResponse(response, undefined, result.status, result.message)`.
  4. Refusal path (`refused`) or exception path (`catchAs`) → short-circuit with appropriate HTTP error.
  - `authEmailVerifyTotal` is incremented on **every** exit path (validation failure, refusal, success, exception) with a `status` label.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Source of the `rejectValidation`, `refused`, and `catchAs` helpers used for every error branch.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf(request)` to extract caller metadata passed into the service.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` for the happy-path reply.
- **`src/modules/account/metrics.ts`** — Exports the `authEmailVerifyTotal` counter incremented on each outcome.
- **`src/modules/account/services/index.ts`** — Exports `accountService`; its `confirmEmailVerification` method performs the token spend and DB update.
- **`src/modules/account/routes.ts`** — Registers `postVerifyConfirm` as the handler for the `POST /account/verify-confirm` route (this file is the callee, not the caller).
- **`src/types/index.ts`** — Supplies the `VerifyEmailConfirmRequest` body type used in the Express `Request` generic.

## Notes

- **Deliberately unauthenticated.** No auth middleware guards this route; the token in the body *is* the credential (same pattern as `reset-confirm` / `delete-confirm`). Don't add an auth check here.
- **No logic in the controller.** All find-then-spend semantics live in `accountService.confirmEmailVerification`. The controller only validates, forwards, and formats the response.
- **Metric on every path.** If you add a new early-return, make sure `authEmailVerifyTotal` is still incremented, or the success/failure ratio will skew.
