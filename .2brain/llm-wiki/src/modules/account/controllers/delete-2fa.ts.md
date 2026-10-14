---
source: src/modules/account/controllers/delete-2fa.ts
sha256: cec7e943c676a253a14f11ee2eeca60d9aebd953c71132f78f1fde2f2e16f51d
generated_at: 2026-10-14T08:29:15.181602+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/delete-2fa.ts

## Purpose

HTTP adapter for `DELETE /account/2fa`. Receives a validated code or backup code in the request body, delegates to `twoFactorService.disableTwoFactor`, and handles the session-remint side-effect (disabling 2FA revokes every session, including the one issuing this request). The route guard already enforces fresh critical auth; this controller adds the explicit code/backup-code requirement to prevent disabling from a stolen session.

## Key elements

- **`delete2fa`** (exported const) — The sole handler. Validates the body against `DisableTwoFactorBody` (Zod), captures a session snapshot, calls `twoFactorService.disableTwoFactor`, remints the caller's session with the original AMR + `AMR.otp` proof, and returns a 200 with an i18n message. On any path it records `authTwoFactorDisableTotal` with `method: 'all'` and `status: 'success' | 'failure'`.

## Relationships

- **`@infrastructure/http/controller`** — `rejectValidation`, `refused`, `catchAs` shape every early-return and error branch.
- **`@infrastructure/http/response`** — `successResponse` builds the final 200 payload.
- **`@infrastructure/http/request`** — `callerContextOf` extracts the caller's context (IP, etc.) to pass into the service.
- **`@infrastructure/i18n`** — `t()` resolves the `account.two-factor.disabled` user-facing string.
- **`@types` (`TwoFactorCodeRequest`)** — Typed generic on the Express `Request` so `request.body` is the parsed code/backup-code shape.
- **`../services` (`twoFactorService`)** — Domain service that actually disables factors and backup codes; returns a result inspected by `refused`.
- **`../session/session` (`sessionSnapshotOf`, `remintSession`)** — Snapshot is taken *before* the disable call (which kills the session); `remintSession` re-issues a valid session for the caller using the saved snapshot and updated proofs.
- **`../domain/session-proof` (`AMR`, `withProofs`)** — `withProofs(amr, AMR.otp)` attaches the OTP authentication method reference to the reminted session so downstream auth checks still pass.
- **`../metrics` (`authTwoFactorDisableTotal`)** — Prometheus counter incremented on both success and failure paths.
- **`../routes`** — Registers `delete2fa` as the handler for `DELETE /account/2fa` behind the critical-auth guard.

## Notes

- The session snapshot is captured **before** calling `disableTwoFactor` because that call invalidates every session for the account, including the in-flight one. Forgetting this ordering would leave the caller logged out with no way to re-authenticate (2FA is already off, but the session is gone).
- The reminted session is tagged with `AMR.otp` in addition to the existing `amr` set — this preserves the "user recently proved an OTP" signal for any downstream risk checks that inspect session proofs.
- The metric label hard-codes `method: 'all'`; there is no per-method breakdown (code vs. backup-code) in this counter.
- `request.authContext!` uses a non-null assertion — the route guard is expected to have populated it; if a caller bypasses the guard the handler will throw at that line.
