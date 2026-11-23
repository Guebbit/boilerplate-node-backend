---
source: src/modules/account/tests/unit/reauth-policy.test.ts
source_sha256: 18dcbf7c5a0adf8927734aafc92fe7e2c9c64eae509a9a55fb1cdf6a3e77ba80
context_sha256: c4b2df23a1fc887b5ad3669406cbf0611b2c454ba5c10991130876ab68fffd43
generated_at: 2026-11-22T04:07:49.400017+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/unit/reauth-policy.test.ts

## Purpose
Unit tests for `amrAfterReauth`, the pure rule that decides which authentication methods (`amr` claims) a re-minted session carries after a step-up re-authentication. HTTP-level behaviour is covered separately in `src/modules/account/tests/contract/reauth.contract.test.ts`.

## Key elements
- `describe('amrAfterReauth')` with three cases:
  - **Only the method just proved:** `('password', false)` yields `['pwd']`; `('email', false)` yields `['email']`.
  - **OTP on second factor:** `('password', true)` yields `['pwd', 'otp']`, so `otp` is added only when a second-factor code was verified in the same call.
  - **No carry-over from login:** `('password', false)` must not contain `'otp'`.

## Relationships
- Imports `amrAfterReauth` from `src/modules/account/services/reauth.ts`, the only unit under test.

## Notes
- `amrAfterReauth` takes no input describing the original login, so a password-only re-auth after a 2FA login cannot be reported as second-factored. The third test guards this.
- From the assertions, the method maps to `pwd` for `'password'` and `email` for `'email'`. These are the only mappings tested.
