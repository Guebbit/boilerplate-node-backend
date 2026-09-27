---
source: tests/support/totp.ts
sha256: 1ad78e5f1a0aedeb43dc4199fa92662877ad453e156280dc5452e0ce2574ef2d
generated_at: 2026-09-27T16:01:42.235805+00:00
model: ollama:qwen3.8:27b
---

# tests/support/totp.ts

## Purpose

Test-helper that mints a valid RFC 6238 TOTP code for a given secret at an arbitrary 30-second step offset from the current time. It exists so two-factor and OAuth test suites can produce a code the server will accept immediately, without waiting for a real 30-second window to elapse.

## Key elements

- **`codeFor(secret, stepsFromNow)`** — Returns a `Promise<string>` of a TOTP code generated via `otplib#generate`. `stepsFromNow` is the number of 30-second steps *ahead* of the current time step. Pass `0` for a fresh-enrollment confirmation; pass `1` (or higher) for any code minted after that confirmation, because the step-0 code is already spent by replay protection.

## Relationships

- Consumed by **`two-factor.contract.test.ts`** and **`two-factor.integration.test.ts`** to mint the one-time code they submit during enrollment-confirmation and subsequent authentication steps.
- Consumed by **`oauth.contract.test.ts`** where a TOTP code is required as part of the two-factor challenge within the OAuth authorization flow.

## Notes

- The parameter is intentionally **not defaulted**. The contract/integration tests must explicitly choose step 0 vs. step 1 to mirror the replay-protection semantics the server enforces.
- Because the server's `epochTolerance` is symmetric (accepts past *and* future steps), a code minted one step ahead still verifies immediately — no `setTimeout(30 000)` hack is needed in tests.
- Uses `Math.floor(Date.now() / 1000)` internally, so the "now" reference is second-granularity; the 30-second offset is whole-step arithmetic.
