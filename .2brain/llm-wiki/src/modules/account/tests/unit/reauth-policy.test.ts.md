---
source: src/modules/account/tests/unit/reauth-policy.test.ts
sha256: 2d2f13ebc79a5644217589da444266cd66a10ede4250f7761ba4ee6eff17d146
generated_at: 2026-10-14T09:22:25.440954+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/reauth-policy.test.ts

## Purpose

Unit tests for the two pure rules the step-up (reauth) flow adds: the `amrAfterReauth` claim set a re-minted session carries, and the boot-time refusal `oauthConfig` enforces when an enabled provider has no deliverable mail transport. HTTP-level behaviour is deliberately excluded (see `contract/reauth.contract.test.ts`).

## Key elements

- **`describe('amrAfterReauth')`** — Verifies that `amrAfterReauth(method, otpVerified)` returns exactly the methods just proved (`['pwd']`, `['email']`, or `['pwd','otp']`) and that no prior-login AMR is carried over (there is no input slot for it).
- **`describe('an enabled OAuth provider needs deliverable mail')`** — Drives `assertConfigIn([oauthConfig.slice], env)` through several environment combinations to confirm the boot is refused when mail cannot be delivered (log transport, smtp without host) and accepted when it can (smtp + host, or no provider enabled, or non-production env).
- **`withGoogle(mail)`** (local helper) — Builds a production env map with Google OAuth credentials plus the given mail settings.
- **`refusal(environment)`** (local helper) — Runs `assertConfigIn` and returns the thrown message string, or `undefined` when boot succeeds.

## Relationships

- **`src/modules/account/services/reauth.ts`** — Source of `amrAfterReauth`, the primary unit under test.
- **`src/modules/account/oauth/config.ts`** — Source of `oauthConfig`; its `.slice` (the validation slice) is what gets asserted.
- **`src/infrastructure/config/define.ts`** — Provides `assertConfigIn`, the generic config-validation function the boot-refusal tests call.

## Notes

- The test file is intentionally pure-logic only; any HTTP or integration concerns belong in `contract/reauth.contract.test.ts` (stated in the file header comment).
- The "no carry-over" case (`amrAfterReauth('password', false)` must not contain `'otp'`) is a regression guard: the function signature has no parameter for a prior session's AMR, so the test documents that constraint.
- The boot check is scoped to `NODE_ENV === 'production'`; development and test environments skip it entirely (covered by the `it.each(['development','test'])` case).
