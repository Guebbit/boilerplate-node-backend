---
source: tests/support/setup-environment.ts
sha256: 89b7ac3ed6dc49796976746dfc9522d3605cd76b48c401d109e4e8010c6410cc
generated_at: 2026-10-29T07:11:09.757633+00:00
model: ollama:qwen3.8:27b
---

# tests/support/setup-environment.ts

## Purpose

A side-effect-only module (no exports) that sets Jest-worker environment variables before any application code reads them. It exists to give test suites generous rate-limit budgets, a shop identity, and in-memory-only rate limiting so that contract/fuzz runs don't fail on 429s, missing payment methods, or Redis connectivity issues unrelated to the code under test. It is wired in via Jest `setupFiles` and imported **first** by `setup.ts`, guaranteeing its writes land before any module that snapshots `process.env` at import time.

## Key elements

- **Rate-limit budget raises** — Every limiter budget (`NODE_*_RATE_LIMIT_MAX`, auth, submission, signup, reset, upload, payment, invoicing, checkout, returns, example, cart-merge, MFA send, API-key, password-check) is set with `??=` to a value well above what a single test run consumes (typically `1000`–`10000`).
- **`NODE_RATE_LIMIT_WINDOW_MS`** — Raised from 60 000 ms to 600 000 ms so the window doesn't roll over mid-suite.
- **`NODE_RATE_LIMIT_REDIS_URL`** — Set to `''` (blank) to force in-memory counting and avoid a compose hostname that can't resolve in CI.
- **Shop identity & VAT** — `NODE_SHOP_*` and `NODE_VAT_RATE_*` provide a concrete Italian shop with 22 %/10 % VAT so tax-asserting tests read real values, not the code's internal fallback.
- **Bank-transfer pair** — `NODE_BANK_TRANSFER_BENEFICIARY` / `_IBAN` so the `shop` scenario's `order.awaitingTransfer` guarantee resolves.
- **Deliberately *not* raised** — `NODE_MFA_CHALLENGE_MAX` stays at its production default (5) because `two-factor.test.ts` asserts that tight limit directly.

## Relationships

- **`tests/support/setup.ts`** — Imports this file as its first line (via Jest `setupFiles`). This ordering is load-bearing: `setup.ts` then pulls in i18n and validation-message modules that read config on import; if those ran first, the `??=` writes here would land after their env snapshot and be invisible.

## Notes

- All writes use `??=`, so a real CI/developer environment variable always wins.
- Values are written as **literals**, not imported from `src/infrastructure/http/middlewares/rate-limit.ts`, because importing that module here would evaluate `buildRateLimiter()` before the env var it reads is set.
- Budgets are *raised*, never set to `Infinity`/disabled, so a genuinely runaway loop in a test still terminates, and the limiters' own unit tests can still hit the limit by overriding to a lower value.
- The file must remain the **first** import in the `setupFiles` chain; reordering it after any module that reads `process.env` silently breaks the guarantees.
