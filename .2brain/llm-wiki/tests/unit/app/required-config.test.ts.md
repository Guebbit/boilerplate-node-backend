---
source: tests/unit/app/required-config.test.ts
sha256: 12d61804900d99f93bf5c5d2ee16fa1cdc70ac1696b387bd41933ca8c195614a
generated_at: 2026-09-23T20:15:31.511841+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/app/required-config.test.ts

## Purpose

Asserts the **content** of `APP_NON_MODULE_CHECKS` — the app-tier boot-time entries that `src/app.ts` folds into `assertRequiredConfig`. It does not test the gate's own collect/report/skip machinery (that belongs to `tests/unit/kernel/required-config.test.ts`); it only verifies which environment variables each entry requires, under which `NODE_ENV`, and how grouped variables (SMTP, provider selectors) interact.

## Key elements

- **`configure()`** — sets the minimal baseline (`NODE_ENV=development`, `NODE_URL`) so every test starts from a valid state; all other relevant vars are already cleared by `withoutEnvironmentInThisFile`.
- **`assertApp()`** — calls `assertRequiredConfig([], APP_NON_MODULE_CHECKS)` exactly as `src/app.ts` wires it.
- **`withoutEnvironmentInThisFile([...])`** — registered once at module top; clears the listed `NODE_*` vars in a `beforeEach` so tests are isolated from the host environment.
- **`afterEach`** — disables the demo profile and calls `resetAnalyticsProvider()` to prevent a memoised provider from leaking between tests.
- **Three `describe` blocks** — *application-wide variables* (NODE_URL, NODE_CORS_ORIGIN), *the SMTP group* (host/credentials/sender), *the provider-selector group* (NODE_ANALYTICS_PROVIDER, NODE_MAIL_TRANSPORT, NODE_LOG_PERSONAL_FIELDS).

## Relationships

- **`src/kernel/required-config.ts`** — provides `assertRequiredConfig`, the function every test exercises.
- **`src/app/required-config.ts`** — exports `APP_NON_MODULE_CHECKS`, the entries under test.
- **`tests/support/environment.ts`** — provides `withoutEnvironmentInThisFile`, which clears the ten relevant env vars before each test.
- **`src/infrastructure/observability/analytics/index.ts`** — `resetAnalyticsProvider` is called in `afterEach` because the provider memoises on first resolve and would otherwise carry state between cases.
- **`src/infrastructure/runtime/demo-profile.ts`** — `enableDemoProfile(false)` in `afterEach` ensures a test that toggled demo mode cannot mask a failure in the next test.

## Notes

- Every test sets `NODE_ENV` to something other than `test` (via `configure()`); if it were left as `test`, the gate short-circuits and no assertions would fire at all.
- `NODE_CORS_ORIGIN` is gated with a `productionOnly` flag — unset in development is valid, unset in production throws.
- The SMTP group treats "no host" as a supported configuration (mail simply unavailable); partial configuration (host without credentials) is the error case.
- `resetAnalyticsProvider()` is essential: the provider is memoised on first resolve, so a leftover from a prior test would silently decide the current one.
