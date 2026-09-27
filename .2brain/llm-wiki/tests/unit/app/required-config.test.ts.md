---
source: tests/unit/app/required-config.test.ts
sha256: 34adb6ae523f8e1b9d092a22c75ab3b22e65fc800cde3081be9d2de06399c632
generated_at: 2026-09-27T16:02:05.635144+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/app/required-config.test.ts

## Purpose

Asserts the *contents* of the app-tier boot-time config checks (`APP_NON_MODULE_CHECKS`) and their pass/fail behavior under various environment states. The gate mechanism itself (collection, one-shot reporting, short-circuit logic) is covered by `tests/unit/kernel/required-config.test.ts`; this file only verifies what the app layer requires and when.

## Key elements

- **`configure()`** – Minimal happy-path env setup (`NODE_ENV=development`, `NODE_URL=https://api.example.com/`). Every test calls this before mutating a single variable.
- **`assertApp()`** – Calls `assertRequiredConfig([], APP_NON_MODULE_CHECKS)`, mirroring exactly how `src/app.ts` wires the gate.
- **`withoutEnvironmentInThisFile([...])`** – Registered at module scope; clears the listed `NODE_*` vars in a `beforeEach` so each test starts from a known-bare environment.
- **`afterEach`** – Resets the demo profile (`enableDemoProfile(false)`) and the memoised analytics provider (`resetAnalyticsProvider()`).
- **Three `describe` blocks** –
  - *application-wide variables*: `NODE_URL` (always required), `NODE_CORS_ORIGIN` and `NODE_LOG_HASH_KEY` (production-only).
  - *the SMTP group*: all-or-nothing; unconfigured is valid, a host without user/pass/sender is not.
  - *the provider-selector group*: `NODE_ANALYTICS_PROVIDER`, `NODE_MAIL_TRANSPORT`, `NODE_LOG_PERSONAL_FIELDS` must match a known enum value or boot is refused.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/required-config.ts` | Provides `assertRequiredConfig`, the gate function under test. |
| `src/app/required-config.ts` | Provides `APP_NON_MODULE_CHECKS`, the specific check entries this file asserts on. |
| `src/infrastructure/runtime/demo-profile.ts` | `enableDemoProfile(false)` called in `afterEach` to undo the short-circuit the demo profile imposes on the gate. |
| `src/infrastructure/observability/analytics/index.ts` | `resetAnalyticsProvider()` called in `afterEach`; the provider is memoised on first resolve, so a leftover instance would influence subsequent assertions. |
| `tests/support/environment.ts` | `withoutEnvironmentInThisFile` supplies the per-file env-var isolation. |

## Notes

- **`NODE_ENV` must be set away from `test`** before every assertion; the gate short-circuits entirely when `NODE_ENV === 'test'`, so a suite that forgets this asserts nothing.
- **Memoised analytics provider** – `resetAnalyticsProvider()` in `afterEach` is not optional; without it, whichever test first resolves the provider "wins" for all later tests in the file.
- **SMTP is all-or-nothing** – setting `NODE_SMTP_HOST` without the companion credentials is a misconfiguration, but leaving all four unset is a supported "email 2FA unavailable" mode.
- **Production-only checks** (`NODE_CORS_ORIGIN`, `NODE_LOG_HASH_KEY`) have intentional dev fallbacks in `app/security.ts` and `adapters/logger.ts` respectively, so they are only enforced when `NODE_ENV=production`.
