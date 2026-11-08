---
source: tests/unit/infrastructure/http/frontend-link.test.ts
sha256: 7647acfdd16b0ba7f039fb9ed71c935471b186bf4b2fe87539e20c395bd39255
generated_at: 2026-11-08T10:12:49.559535+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/frontend-link.test.ts

## Purpose

Unit tests for `frontendLink`, the infrastructure-level helper that turns a route template plus a locale and optional params into a fully-resolved URL pointing at the paired frontend. The tests pin down the three concerns this layer owns: origin resolution, the locale path segment, and `{placeholder}` substitution with URL-encoding.

## Key elements

- **`TOKEN`** – A shared token string (`'a1b2c3d4e5f6'`) used as a concrete value in several substitution assertions.
- **`useEnvironment(overrides)`** – Local helper that calls `setEnvironment` (from `tests/support/environment`) *and* `resetSupportedLocales` in one step, because changing `NODE_SUPPORTED_LOCALES` / `NODE_DEFAULT_LOCALE` invalidates the i18n cache.
- **`afterEach(resetSupportedLocales)`** – Clears the locale cache after every test so a cached locale list never leaks into the next case.
- **`describe('frontendLink — placeholder substitution')`** – Covers single/multi placeholder filling, no-placeholder passthrough, URL-encoding of path-unsafe values (spaces, `/`), and ignoring params the template doesn't reference.
- **`describe('frontendLink — the locale segment')`** – Verifies the locale sits directly after the origin in the pathname, and that an unsupported locale clamps to `NODE_DEFAULT_LOCALE` instead of producing a 404 path.
- **`describe('frontendLink — a token in the fragment')`** – Asserts that a token value with special chars (`/`, `&`, `=`) ends up encoded inside `url.hash` and is absent from `url.search` and `url.pathname`.
- **`describe('frontendLink — the origin')`** – Confirms the fallback to `http://localhost:8080` when `NODE_FRONTEND_URL` is unset, and that a custom `NODE_FRONTEND_URL` is honoured.

## Relationships

- **`src/infrastructure/http/frontend-link.ts`** – The module under test; `frontendLink` is the single function every assertion exercises.
- **`src/infrastructure/i18n/index.ts`** – Barrel re-export of `resetSupportedLocales`, which the tests import to clear the cached supported-locale list.
- **`src/infrastructure/i18n/catalog.ts`** – Source of the `resetSupportedLocales` function and the locale-validation logic the "clamps an unsupported locale" test exercises.
- **`tests/support/environment.ts`** – Provides `setEnvironment`, used (via `useEnvironment`) to override `NODE_SUPPORTED_LOCALES`, `NODE_DEFAULT_LOCALE`, and `NODE_FRONTEND_URL` per test case.

## Notes

- The `useEnvironment` helper is intentionally paired with `resetSupportedLocales` because the i18n module caches its locale list on first access; changing env vars without resetting would make the "unsupported locale" test flaky.
- `afterEach` resets only the locale cache, not the environment. Environment overrides are scoped per-test by the helper itself, so no global env teardown is needed.
- The default origin `http://localhost:8080` is asserted explicitly; if the implementation changes the dev fallback, these origin tests will fail first.
- URL-encoding is tested at the value level (`order 1/2` → `order%201%2F2`), not at the template level — the template itself is expected to be a raw, unencoded path.
