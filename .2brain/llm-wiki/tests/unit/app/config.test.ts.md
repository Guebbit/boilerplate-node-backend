---
source: tests/unit/app/config.test.ts
sha256: 6a7847f05d6e2fde3d0096210b96db38369348aced52f6fae058e1c873aefa2a
generated_at: 2026-11-08T10:02:27.525561+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/app/config.test.ts

## Purpose

Validates the app-tier boot-time environment checks defined in `APP_CONFIG_SLICES`. Each test asserts *which* variables must be present, under which `NODE_ENV`, and with what values — not the mechanism of `assertModuleConfig` itself (covered in `tests/unit/kernel/module-config.test.ts`). The file exists so that a misconfigured slice in `src/app/config.ts` is caught before deployment rather than at the first request.

## Key elements

- **`configure()`** – Sets a minimal valid environment (`NODE_ENV=development`, `NODE_URL`, `NODE_SUPPORT_EMAIL`) so every other variable starts cleared.
- **`assertApp()`** – Wraps `assertModuleConfig([], APP_CONFIG_SLICES)` exactly as `src/app.ts` calls it; the single entry point every test exercises.
- **`e2eSmtp(host)`** – Configures a full SMTP + `NODE_E2E_RUN=1` scenario for the local-sink guard tests.
- **`withoutEnvironmentInThisFile([...])`** (from `tests/support/environment`) – Clears all listed `NODE_*` variables before each test case.
- **`afterEach` → `resetAnalyticsProvider()`** – Resets the memoised analytics provider so a previous case's resolved instance does not leak into the next.
- **`describe` blocks** – Organised by concern: application-wide variables, bare environment, support address, SMTP group, mail guards (e2e local-sink), provider-selector group, antibot provider group.

## Relationships

- **`src/app/config.ts`** – Source of `APP_CONFIG_SLICES`, the array of checks under test.
- **`src/kernel/module-config.ts`** – Source of `assertModuleConfig`, the validation gate that collects and reports slice failures.
- **`src/infrastructure/observability/analytics/index.ts`** – Provides `resetAnalyticsProvider`, called in `afterEach` to clear memoised state between cases.
- **`tests/support/environment.ts`** – Provides `withoutEnvironmentInThisFile` and `setEnvironment` helpers used throughout.

## Notes

- **Every test must set `NODE_ENV` away from `test`.** The gate short-circuits entirely when `NODE_ENV === 'test'`; forgetting this makes the suite pass vacuously.
- **`productionOnly` slices** (`NODE_CORS_ORIGIN`, `NODE_FRONTEND_URL`, `NODE_PSEUDONYM_KEY`): unset is valid outside production but required in `production` and `staging`. `development` and `undefined` are the two "lenient" values.
- **Antibot checks live here, not in the antibot module manifest**, because the human-challenge middleware is cross-cutting — it runs even if antibot's HTTP routes are unmounted, so its validation cannot be owned by a manifest that module deletion would remove.
- **`resetAnalyticsProvider()` is load-bearing.** The provider is memoised on first resolve; without the reset, a prior test's resolved instance decides the outcome of the next test that touches it.
