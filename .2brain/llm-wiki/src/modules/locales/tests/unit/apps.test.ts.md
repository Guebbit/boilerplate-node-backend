---
source: src/modules/locales/tests/unit/apps.test.ts
sha256: 6f0d3718aad47287e1ec52ee8d55736770847481dde5882d87bd51b5c1f6a3cd
generated_at: 2026-11-08T06:29:10.575568+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/unit/apps.test.ts

## Purpose

Unit tests for the app-registry readers exported by `../../apps`. Because every reader is lazy (reads `process.env` at call time), each test sets the environment variables it needs and then invokes the reader. The suite guards against cross-test pollution by unsetting its three variables before running.

## Key elements

- **`KEYS`** — `as const` array listing the three env vars this suite owns: `NODE_LOCALE_APP_BACKEND`, `NODE_LOCALE_APP_FRONTEND`, `NODE_LOCALE_APPS_EXTRA`.
- **`withoutEnvironmentInThisFile(KEYS)`** — module-scope call (from `@tests/environment`) that strips those vars so no leaked value from a prior suite is visible.
- **`describe('the app registry', …)`** — four cases:
  - *defaults to the demo pair* — verifies `listApps()`, `backendApp()`, `frontendApp()` return the built-in `demo-be` / `demo-fe` pair.
  - *reads the two ids from the environment* — sets `NODE_LOCALE_APP_BACKEND` / `NODE_LOCALE_APP_FRONTEND` and checks `listApps()` reflects them.
  - *adds the extra frontends, labelled or not, and drops a duplicate* — exercises the `NODE_LOCALE_APPS_EXTRA` parsing (labels, bare ids, empty entries, duplicate removal).
  - *tells a frontend app from the backend one and from a stranger* — checks `frontendAppIds`, `isFrontendApp`, `isKnownApp` classification.

## Relationships

- **`src/modules/locales/apps.ts`** — the unit under test; this file imports `listApps`, `backendApp`, `frontendApp`, `frontendAppIds`, `isFrontendApp`, `isKnownApp`.
- **`tests/support/environment.ts`** — provides `setEnvironment` (per-test override) and `withoutEnvironmentInThisFile` (suite-level guard) so the tests never rely on ambient env state.

## Notes

- The module doc-comment warns that a leaked `NODE_LOCALE_APPS_EXTRA` could let an unrelated contract test accept an unconfigured app. The `withoutEnvironmentInThisFile` call at the top of the file is the mitigation; if you add new env-driven behaviour, register the variable in `KEYS`.
- Tests that call `setEnvironment` do not explicitly reset afterwards within the same `it`; they rely on the file-level guard plus the next test's own `setEnvironment` call. If you add a test that does *not* set all three keys, make sure the un-set keys are truly absent rather than inheriting a sibling's value.
