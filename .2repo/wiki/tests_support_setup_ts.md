# tests/support/setup.ts

## Purpose

Jest `setupFiles` bootstrap that runs once per worker **before** any test module is imported. It sets environment variables (rate-limit budgets, JWT secrets, TOTP key, metrics token, Redis opt-out) and initialises i18next + Zod validation messages so that modules which capture defaults at import time see correct values. It deliberately does **not** start a database—that is per-suite via `setupTestDb()`.

## Key elements

- **`process.env.* ??=` assignments** — Sets `NODE_RATE_LIMIT_MAX` (2000), `NODE_AUTH_RATE_LIMIT_MAX` / `NODE_AUTH_RATE_LIMIT_ADDRESS_MAX` (1000), `NODE_SUBMISSION_RATE_LIMIT_MAX` (1000), `NODE_UPLOAD_RATE_LIMIT_MAX` (1000), `NODE_RATE_LIMIT_REDIS_ENABLED` (`'0'`), `NODE_METRICS_TOKEN`, `NODE_TOKEN_ACCESS`, `NODE_TOKEN_REFRESH`, `NODE_TOTP_ENCRYPTION_KEY`. All use `??=` so a `.env` or CI override wins.
- **MONGOMS binary detection** — Checks `MONGOMS_SYSTEM_BINARY` (default `/tmp/mongod`) for existence; if present, disables version/MD5 checks so `mongodb-memory-server` uses the local binary instead of downloading.
- **`registerLocaleDirectories(...)`** — Globs `src/modules/*/locales` off disk (not via module-registry import) and registers them with the i18n catalog. Reading from disk avoids importing the module registry, which would defeat `jest.mock`.
- **`i18next.init(...)`** — Initialises i18next with `en` as source language, the project's fallback locale, supported locales, and loaded resources. Fire-and-forget (`void`).
- **`registerValidationMessages()`** — Wires Zod custom error messages through the i18n catalog so domain messages resolve to translated copy rather than raw keys.

## Relationships

- **`src/infrastructure/i18n/index.ts`** — Barrel re-export consumed here for `getFallbackLocale`, `listSupportedLocales`, `loadLocaleResources`, and `registerLocaleDirectories`.
- **`src/infrastructure/i18n/catalog.ts`** — Underlying implementation of the functions above; `loadLocaleResources()` reads the directories registered in the step before `i18next.init`.
- **`src/infrastructure/http/validation-messages.ts`** — Exports `registerValidationMessages`, which hooks Zod's error-message resolution to the now-initialised i18next instance.

## Notes

- **Import-time ordering is the contract.** Anything configured here is read when the consuming module is first imported. Moving a setting to `beforeAll` would be too late—modules like `security.ts` build rate limiters at import time.
- **`??=` everywhere** means a local `.env` (loaded via `dotenv/config` in `src/app.ts`) or a CI variable overrides the test defaults. The fallbacks exist for CI where no `.env` is present.
- **Rate-limit values are literals, not imports** from `security.ts`. Importing that module here would evaluate `rateLimit()` before the env var it reads is set.
- **Redis is disabled (`NODE_RATE_LIMIT_REDIS_ENABLED=0`).** The compose hostname in `.env` doesn't resolve from a test runner; in-memory counting also avoids cross-suite counter contamination.
- **i18next init is async but not awaited.** Under Jest's `setupFiles` ordering, i18next is ready by the time a module-scope `t()` first runs, but tests that assert on translated messages should initialise their own instance via `@tests/i18n-boot` rather than relying on this global.
- **Locale directories are discovered via `readdirSync` on disk**, not by importing the module registry. Importing the registry here would load every module before any `jest.mock` could intercept it, silently un-mocking repositories across unrelated suites.
- **The 2000 rate-limit budget tracks the FUZZ suite.** It was raised from 1000 when the `inventory` module grew from 2 to 5 endpoints. If a new module tips it, raise it again—it is not what the fuzz suite is testing.
