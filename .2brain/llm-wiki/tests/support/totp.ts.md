---
source: tests/support/totp.ts
sha256: 1ad78e5f1a0aedeb43dc4199fa92662877ad453e156280dc5452e0ce2574ef2d
generated_at: 2026-11-08T10:01:53.907774+00:00
model: ollama:qwen3.8:27b
---

# tests/support/totp.ts

## Purpose

Test-support helper that mints RFC 6238 TOTP codes for a given secret at a controllable offset from "now." It exists so tests can produce the exact code a real authenticator app would display at a specific 30-second step, without waiting in real time, and without hard-coding a single "current" step.

## Key elements

- **`codeFor(secret: string, stepsFromNow: number): Promise<string>`** — Generates a TOTP code via `otplib.generate` for `secret`, shifted `stepsFromNow` 30-second steps ahead of the current epoch. Step 0 yields a "now" code (used to confirm a fresh enrollment); step 1+ yields a code for the *next* window, which is what post-enrollment verifications need since the step-0 code is already spent and replay protection would reject it.

## Relationships

- **`tests/support/authenticator.ts`** — Sibling support module; tests import both to simulate the full two-factor flow (enrollment via authenticator, code generation via this file).
- **`src/modules/account/tests/contract/two-factor.contract.test.ts`** and **`…/oauth.contract.test.ts`** — Contract tests that call `codeFor` to assert the API's TOTP verification behavior at specific steps.
- **`src/modules/account/tests/integration/two-factor.test.ts`**, **`…/two-factor-concurrency.test.ts`**, **`…/step-up-otp.test.ts`**, **`…/login-restore.test.ts`**, **`…/session-epoch.test.ts`**, **`…/session-modes.test.ts`**, **`…/session-remint-amr.test.ts`**, **`…/revocation-causes.test.ts`** — Integration tests that mint codes at step 0 (confirm) or step 1+ (verify) to exercise two-factor paths end-to-end.
- **`tests/integration/journeys/an-accounts-whole-security-life.test.ts`**, **`…/social-login-with-a-second-factor.test.ts`**, **`tests/support/staff-second-factor.test.ts`** — Higher-level journey and staff tests that rely on `codeFor` to complete second-factor challenges without a real device.

## Notes

- `stepsFromNow` is **not optional** — callers must explicitly choose 0 (confirm) vs ≥ 1 (verify). This forces test authors to think about *which* time window they intend, matching the server's asymmetric replay protection.
- The server's `epochTolerance` is symmetric (accepts ±1 step), so a code minted at step 1 verifies immediately without a 30-second wait. Tests should not depend on a real clock delay.
- The function is async only because `otplib.generate` returns a Promise; there is no internal I/O.
