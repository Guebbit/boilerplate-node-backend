---
source: tests/support/setup.ts
sha256: 82e4451198c2576f5f5bd33428c040523404436de56113173c6c71be0b477348
generated_at: 2026-09-23T20:14:27.216021+00:00
model: ollama:qwen3.8:27b
---

# tests/support/setup.ts

## Purpose

Global Jest bootstrap (wired via `setupFiles`) that runs **once per worker, before any test module is imported**. It pre-sets environment variables — rate-limit budgets, JWT/TOTP secrets, locale resources, payment-method config — so that modules which capture their configuration at import time see test-appropriate values. Setting any of this in a `beforeAll` would be too late; the modules under test would already have locked in production defaults.

## Key elements

- **Rate-limit budget overrides** (`??=` on ~25 `process.env.NODE_*` vars): raises per-IP, per-account, per-credential, and per-feature budgets (general, auth, submission, signup, reset, upload, webhook, payment confirm/decline, invoice, MFA-send, API-key, password-check) to 1000–2000 so that suites firing many requests from a single address don't hit spurious 429s. The window is raised to 600 000 ms.
- **`NODE_RATE_LIMIT_REDIS_ENABLED ??= '0'`**: forces in-memory counting, avoiding a compose hostname that won't resolve in a test runner and preventing shared-counter contamination.
- **`NODE_PASSWORD_BREACH_HIBP ??= 'off'`**: disables the live `api.pwnedpasswords.com` call so suites never depend on egress or third-party latency.
- **Secret / credential defaults**: `NODE_TOKEN_ACCESS`, `NODE_TOKEN_REFRESH`, `NODE_TOTP_ENCRYPTION_KEY`, `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY`, `NODE_METRICS_TOKEN` — all `??=` so a local `.env` or a specific test can still override.
- **Business-config defaults**: `NODE_BANK_TRANSFER_BENEFICIARY`, `NODE_BANK_TRANSFER_IBAN`, `NODE_SHOP_COUNTRY`, `NODE_VAT_RATE_DEFAULT`, `NODE_VAT_RATE_REDUCED` — ensure the shop scenario and tax arithmetic are resolvable without a developer's `.env`.
- **i18n & validation-message registration**: imports `getFallbackLocale`, `listSupportedLocales`, `loadLocaleResources`, `registerLocaleDirectories` from `@infrastructure/i18n` and `registerValidationMessages` from `@infrastructure/http/validation-messages` (invocations appear in the truncated tail) to load locale resources before any zod schema evaluates a message thunk.

## Relationships

- **`src/infrastructure/i18n/index.ts` / `catalog.ts`** — this file imports the i18n loader API and calls it so that `@infrastructure/i18n` resources are registered before any downstream module (e.g. zod schemas) reads them at import time.
- **`src/infrastructure/http/validation-messages.ts`** — this file imports and calls `registerValidationMessages` to attach validation message templates before rate-limiter or schema modules capture them.

## Notes

- **`??=` everywhere, never `=`**: any individual test (e.g. `breached-passwords/index.test.ts`, rate-limiter unit tests) can still set a lower or different value *after* this file has run.
- **Budget values are hard-coded literals**, not imported from `rate-limit.ts`, because importing that module here would evaluate `buildRateLimiter()` before the env var it reads has been set.
- **`NODE_MFA_CHALLENGE_MAX` is deliberately *not* raised**: `two-factor.test.ts` relies on the tight production default (5) to prove the challenge-kill behaviour; raising it would make that assertion untestable.
- **No database setup here**: Mongo is per-suite via `setupTestDb()`, so pure-function suites don't pay the cost of a `mongod`.
- **File is truncated in the source snapshot**; the visible portion covers all rate-limit, business-config, secret, and feature-flag env vars plus the i18n/validation-message imports.
