---
source: src/modules/locales/tests/unit/apps.test.ts
sha256: 6f0d3718aad47287e1ec52ee8d55736770847481dde5882d87bd51b5c1f6a3cd
generated_at: 2026-10-15T10:48:34.751252+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/unit/apps.test.ts

## Purpose

Unit tests for the app registry readers exported by `apps.ts`. Each case sets the relevant `NODE_LOCALE_*` environment variables, calls the lazy readers, and asserts the resulting app list or classification, ensuring the registry behaves correctly from defaults through custom and extended configurations.

## Key elements

- **`withoutEnvironmentInThisFile(KEYS)`** — File-level guard that unsets `NODE_LOCALE_APP_BACKEND`, `NODE_LOCALE_APP_FRONTEND`, and `NODE_LOCALE_APPS_EXTRA` for every test in this file, preventing cross-test contamination.
- **"defaults to the demo pair, the backend first"** — Verifies `listApps()` returns `demo-be`/`demo-fe` and that `backendApp()` / `frontendApp()` resolve to those ids.
- **"reads the two ids from the environment"** — Confirms `listApps()` picks up `NODE_LOCALE_APP_BACKEND` and `NODE_LOCALE_APP_FRONTEND` when set.
- **"adds the extra frontends, labelled or not, and drops a duplicate"** — Exercises `NODE_LOCALE_APPS_EXTRA` parsing: comma-separated entries, optional `id=label` syntax, blank tokens, and duplicate elimination against the default frontend.
- **"tells a frontend app from the backend one and from a stranger"** — Validates `frontendAppIds()`, `isFrontendApp()`, and `isKnownApp()` classification logic.

## Relationships

- **`src/modules/locales/apps.ts`** — The module under test. This file imports and exercises all six public readers (`listApps`, `backendApp`, `frontendApp`, `frontendAppIds`, `isFrontendApp`, `isKnownApp`).
- **`tests/support/environment.ts`** — Provides the two test helpers: `setEnvironment` (sets env vars per case) and `withoutEnvironmentInThisFile` (registers a global cleanup so the three `NODE_LOCALE_*` keys are always removed after the file finishes).

## Notes

- The module doc comment warns that a leaked `NODE_LOCALE_APPS_EXTRA` could cause an *unrelated* contract test to accept a misconfigured app — the `withoutEnvironmentInThisFile` call is the safety net, not a mere convenience.
- Tests mutate the process environment directly; they rely on the helper's `afterEach`-style cleanup rather than a local `try/finally`. Do not add manual `delete process.env[…]` calls.
- The `KEYS` tuple is typed `as const`; keep it in sync with any new env var the registry reads.
