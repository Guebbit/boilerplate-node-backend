---
source: src/modules/account/tests/unit/reauth-policy.test.ts
sha256: 18dcbf7c5a0adf8927734aafc92fe7e2c9c64eae509a9a55fb1cdf6a3e77ba80
generated_at: 2026-11-08T04:48:52.326471+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/reauth-policy.test.ts

## Purpose

Unit tests for the pure decision logic of `amrAfterReauth` — the function that determines which Authentication Method References (AMR) a re-minted session should claim. This file covers the rule-level "what claims are produced" concern; the HTTP/transport behaviour lives in a separate contract test (`contract/reauth.contract.test.ts`).

## Key elements

- **`describe('amrAfterReauth')`** – the sole test suite in the file.
- **"claims only the method just proved"** – asserts that `amrAfterReauth('password', false)` → `['pwd']` and `amrAfterReauth('email', false)` → `['email']`.
- **"adds otp only when a second-factor code was verified in the same call"** – asserts `amrAfterReauth('password', true)` → `['pwd', 'otp']`.
- **"carries nothing over from the login"** – asserts that a password-only re-auth does **not** include `'otp'`, even if the original login used 2FA. Encodes the no-state-carryover guarantee.

## Relationships

- **`src/modules/account/services/reauth.ts`** – the sole import; provides the `amrAfterReauth(method: string, otpVerified: boolean): string[]` function under test. This file exercises its return values directly with no mocks or HTTP layer.

## Notes

- The file header explicitly scopes itself as the *pure rule* step-up test. If you are looking for request/response shape, headers, or status-code assertions, go to `contract/reauth.contract.test.ts` instead.
- `amrAfterReauth` is treated as a pure function of its two arguments; the tests never set up prior session state, reinforcing that the function must not depend on any external context.
