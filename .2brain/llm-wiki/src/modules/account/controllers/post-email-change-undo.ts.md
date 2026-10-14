---
source: src/modules/account/controllers/post-email-change-undo.ts
sha256: 9e2a4905ec4c1578e11c88ab3627735b7e9a2456bfaefd626a40dc381b188199
generated_at: 2026-10-14T08:34:20.118781+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-email-change-undo.ts

## Purpose

Handles `POST /account/email-change-undo`, a public endpoint that accepts a one-time undo token (mailed to the *old* email address) and reverts the account's email back to its previous value. The token itself is the credential — no session or Bearer auth is required.

## Key elements

- **`postEmailChangeUndo`** (exported function) — The sole handler. Validates the `{ token }` body with the shared `ConfirmEmailChangeBody` Zod schema, then:
  1. Calls `accountService.redeemLiveToken(EMAIL_CHANGE_UNDO_TOKEN_TYPE, token)` to atomically find-and-spend the token (prevents race conditions).
  2. On success, calls `accountService.undoEmailChange(user, callerContextOf(request))` to perform the revert.
  3. Increments the `authEmailChangeUndoTotal` metric with `status: 'success' | 'failure'` on every path.
  4. Returns `200` with an i18n'd "undone" message, or `422` (token not found / validation failure), or a mapped error via `catchAs` (409 if the old address was re-claimed).

## Relationships

- **`src/infrastructure/http/controller.ts`** — Provides `rejectValidation` (Zod error → 422) and `catchAs` (normalizes thrown errors to HTTP responses).
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` and `rejectResponse` helpers used for all outbound JSON.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf(request)` to extract caller metadata (IP, user-agent) passed into `undoEmailChange`.
- **`src/infrastructure/i18n/index.ts`** — Provides the `t()` function for user-facing error/success strings.
- **`src/modules/account/metrics.ts`** — Exports `authEmailChangeUndoTotal` (a Prometheus counter) incremented on every request outcome.
- **`src/modules/account/routes.ts`** — Registers this handler at `POST /account/email-change-undo`.
- **`src/modules/account/services/index.ts`** — Exports `accountService` (redeem + undo logic) and the `EMAIL_CHANGE_UNDO_TOKEN_TYPE` discriminator constant.
- **`src/types/index.ts`** — Exports `VerifyEmailConfirmRequest` type; the undo endpoint reuses this type because both confirm and undo accept the same `{ token }` body shape (orval names the generated type after the shared schema).

## Notes

- The body schema is **`ConfirmEmailChangeBody`** (the confirm endpoint's schema), not a dedicated undo schema — both endpoints accept an identical `{ token }` payload, so there is no separate Zod schema for undo.
- Token type safety: `EMAIL_CHANGE_UNDO_TOKEN_TYPE` is checked server-side; a confirm or verify token can never satisfy this lookup, so the three token links (confirm, undo, verify) cannot cross-activate each other.
- A `409 Conflict` is a legitimate outcome: the "old" address may have been claimed by another account between the change and the undo, making the revert impossible.
- The handler is intentionally **public** (no middleware auth), consistent with `email-change-confirm`; the one-time token is the sole credential.
