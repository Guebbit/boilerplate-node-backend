---
source: src/modules/account/controllers/delete-2fa.ts
sha256: 4c6fe8f303def693131301ba67f21e6dce0035913f97faeff52dd452e26516bc
generated_at: 2026-10-15T09:53:16.809277+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/delete-2fa.ts

## Purpose

HTTP handler for `DELETE /account/2fa`. Validates the request body (code or backup code), calls `twoFactorService.disableTwoFactor`, and then remints the caller's session because the disable operation revokes all active sessions—including the one the request was made on.

## Key elements

- **`delete2fa(request, response)`** — The sole export. Parses `DisableTwoFactorBody` (zod), calls `twoFactorService.disableTwoFactor(id, code, callerContext)`, and on success remints a session via `remintSession` with `AMR.otp` proof before returning `successResponse` with a localized message.
- **`sessionSnapshotOf(request, id)`** — Captured *before* the disable call so the remint has the prior session state to restore from.
- **`authTwoFactorDisableTotal`** — Incremented with `{ method: 'all', status: 'failure' | 'success' }` on every outcome (parse failure, service refusal, or success).

## Relationships

- **`@infrastructure/http/controller`** — `rejectValidation`, `refused`, `catchAs` handle the three failure paths.
- **`@infrastructure/http/request`** — `callerContextOf` extracts IP/user-agent metadata passed down to the service.
- **`@infrastructure/http/response`** — `successResponse` shapes the 200 reply.
- **`@infrastructure/i18n`** — `t('account.two-factor.disabled')` localizes the success message.
- **`@types`** — `TwoFactorCodeRequest` (body type) and `AuthTokens` (response token type).
- **`../services`** — `twoFactorService.disableTwoFactor` is the actual business logic invoked.
- **`../session/session`** — `sessionSnapshotOf` and `remintSession` manage the pre/post-disable session lifecycle.
- **`../domain/session-proof`** — `AMR.otp` and `withProofs` re-attest the reminted session so it carries the fresh 2FA-verification claim.
- **`../metrics`** — `authTwoFactorDisableTotal` counter.
- **`../routes`** — Registers `delete2fa` as the `DELETE /account/2fa` handler.

## Notes

- The session snapshot is taken **before** calling the service because the disable call destroys the very session the request is riding on. The remint depends on that snapshot.
- `AMR.otp` is added to the reminted session's auth methods list, so downstream middleware can distinguish a freshly-2FA-verified session from a plain token refresh.
- The controller is intentionally thin: all domain rules (code validation, backup-code consumption, factor deletion) live in `twoFactorService`.
