---
source: tests/unit/infrastructure/http/frontend-link.test.ts
sha256: 9ef8fc60f263f20e732b4abc2226325d9efb16bf11e57426f4fd24d54498c303
generated_at: 2026-10-15T13:11:12.593261+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/frontend-link.test.ts

## Purpose

Unit tests for `frontendLink`, the single infrastructure function that assembles a full frontend URL from a path template, a locale, and named parameters. It verifies placeholder substitution, locale-segment placement, token-in-fragment safety, and origin resolution against `NODE_FRONTEND_URL`.

## Key elements

- **`TOKEN`** — a shared hex string used as a sample placeholder value across tests.
- **`withEnv(overrides, run)`** — local helper that calls `overrideEnvironment` to set/unset env vars, resets the i18n locale cache before *and* after (in a `finally`), then executes `run`. Ensures no locale-list cache leaks between tests.
- **`describe('frontendLink — placeholder substitution')`** — verifies single/multiple `{name}` replacement, URL-encoding of values containing `/` or spaces, pass-through when no placeholders exist, and that extra params are ignored.
- **`describe('frontendLink — the locale segment')`** — confirms the locale appears as the first path segment after origin, and that an unsupported locale is clamped to the deployment default rather than producing a broken link.
- **`describe('frontendLink — a token in the fragment')`** — asserts that a value with `/`, `&`, `=` stays in `url.hash`, never polluting `pathname` or `search`.
- **`describe('frontendLink — the origin')`** — checks the default origin (`http://localhost:8080`) when `NODE_FRONTEND_URL` is unset, and a custom origin when it is set.

## Relationships

- **`src/infrastructure/http/frontend-link.ts`** — the module under test; every `it` block calls its exported `frontendLink` function.
- **`src/infrastructure/config/store.ts`** — provides `overrideEnvironment`, the mechanism used by `withEnv` to temporarily set or clear `NODE_FRONTEND_URL`, `NODE_SUPPORTED_LOCALES`, and `NODE_DEFAULT_LOCALE`.
- **`src/infrastructure/i18n/index.ts`** — re-exports `resetSupportedLocales`, called by `withEnv` to clear the cached locale list so tests see fresh `NODE_SUPPORTED_LOCALES` values.
- **`src/infrastructure/i18n/catalog.ts`** — indirect dependency; the locale list that `resetSupportedLocales` clears originates here.

## Notes

- The locale-clamping test depends on the i18n cache being reset *before* `frontendLink` runs; without `resetSupportedLocales` in `withEnv`, a prior test's locale list would persist and the clamp assertion would be flaky.
- The default origin `http://localhost:8080` is hardcoded in `frontend-link.ts`; tests assert against it explicitly, so changing that default in production code will break these tests.
- The fragment-token test intentionally uses a value (`a/b&c=d`) that would break path/query parsing if leaked — it is a regression guard for server-side token exposure.
