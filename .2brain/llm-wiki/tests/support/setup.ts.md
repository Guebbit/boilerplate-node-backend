---
source: tests/support/setup.ts
sha256: 61acf39624be4eaf8105744936adc113b04824e79ca6c204d07a7d00f5068d5d
generated_at: 2026-09-27T16:01:20.941235+00:00
model: ollama:qwen3.8:27b
---

# tests/support/setup.ts

## Purpose

Global Jest bootstrap (wired via `setupFiles`) that sets required `process.env` variables **before** any test module is imported. Many production modules capture config at import time (rate-limiters build their instances, i18n must have resources loaded before zod schema thunks evaluate), so this file must run first. It also pins environment values that a developer's `.env` or CI would otherwise leave unset, so suites are deterministic and independent of external services (Redis, HIBP API).

## Key elements

- **Top-level `process.env` assignments (all `??=`)** — sets defaults for every rate-limiter budget (`NODE_*_RATE_LIMIT_MAX`, `NODE_MFA_SEND_MAX`, `NODE_API_KEY_RATE_LIMIT_MAX`, `NODE_PASSWORD_CHECK_RATE_LIMIT_MAX`, etc.), the shared window (`NODE_RATE_LIMIT_WINDOW_MS`), bank-transfer credentials, shop country/VAT rates, Redis toggle, HIBP toggle, metrics token, JWT/encryption keys, and PII encryption key.
- **`bootI18n()`** — loads i18n resources so that any subsequent `zod` schema can resolve message thunks.
- **`registerValidationMessages()`** — registers HTTP-layer validation messages into the i18n catalog.
- **`MODULES_ROOT`** (imported from `@tests/paths`) — provides the filesystem root used by other test-support utilities.

## Relationships

- **`src/infrastructure/http/validation-messages.ts`** — exports `registerValidationMessages`, called here to seed HTTP error messages into the i18n catalog before any schema validates a request.
- **`src/infrastructure/i18n/boot.ts`** — exports `bootI18n`, called here to load all locale resources at bootstrap time.
- **`src/infrastructure/i18n/index.ts`** — the public i18n entry point whose internal state must be populated before any module imports it and reads a translation.
- **`tests/support/paths.ts`** — exports `MODULES_ROOT`, consumed here (and by other test helpers) to resolve filesystem paths relative to the source tree.

## Notes

- **Ordering is critical.** This runs via `setupFiles` (before module imports), not `beforeAll`. Setting the same variables in a hook would be too late for import-time captures (e.g., `buildRateLimiter()`).
- **Rate limits are raised, never disabled.** This keeps runaway loops terminable and lets limiter-specific tests still assert a 429 by lowering the value per-test.
- **`NODE_MFA_CHALLENGE_MAX` is deliberately NOT raised.** `two-factor.test.ts` relies on the tight production default (5) to prove the challenge-kill logic works.
- **`NODE_RATE_LIMIT_REDIS_ENABLED` is forced to `'0'`.** The limiters count in memory only; a shared Redis would couple suite results to external state, and the compose hostname in `.env` won't resolve from a test runner.
- **`NODE_PASSWORD_BREACH_HIBP` defaults to `'off'`.** Individual tests that need rung-2 can flip it on with a mocked `fetch`; the global default prevents live third-party calls and latency-induced flakiness.
- **All assignments use `??=`, not `=`.** This allows a `.env` (loaded by `src/app.ts` via `dotenv/config`) or a per-test override to take precedence, while still providing a safe fallback for CI environments that have no `.env` at all.
