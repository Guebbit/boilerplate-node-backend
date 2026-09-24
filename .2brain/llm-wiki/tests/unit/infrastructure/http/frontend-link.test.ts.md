---
source: tests/unit/infrastructure/http/frontend-link.test.ts
sha256: af522328802925a6e5cb75bef0d8bee1718599e78c00a04439c3576eed24f123
generated_at: 2026-09-23T20:20:27.310280+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/frontend-link.test.ts

## Purpose

Unit tests for the `frontendLink` builder — the single function that produces every confirmation URL the app emails (verify, reset, delete, email-change, order). Because all flows share this one builder, a regression here breaks every outbound link simultaneously, which is why coverage is thorough across kinds, locales, and configuration paths.

## Key elements

- **`withEnv(overrides, run)`** — local helper that saves current env vars, applies overrides, calls `resetSupportedLocales()`, runs the test body, then restores originals and resets the locale cache again. Used by every test that depends on `NODE_FRONTEND_URL`, `NODE_SUPPORTED_LOCALES`, or per-kind template vars.
- **`describe('frontendLink — the default template per kind')`** — asserts the exact URL for each kind (`verify`, `reset`, `delete`, `email-change`, `order`) and that the four token-based kinds produce pairwise-distinct paths.
- **`describe('frontendLink — the locale segment')`** — verifies locale is the first path segment and that an unsupported locale is clamped to the deployment default instead of producing a 404 path.
- **`describe('frontendLink — configuration')`** — covers the `NODE_FRONTEND_URL` origin fallback (defaults to `http://localhost:8080`), a custom origin, and a per-kind template override (`NODE_FRONTEND_LINK_RESET`) while confirming other kinds are unaffected.
- **Constants `TOKEN` / `ORDER_ID`** — fixed literals used across assertions to keep expected URLs readable.

## Relationships

- **`src/infrastructure/http/frontend-link.ts`** — the module under test; the file imports and exercises `frontendLink` exclusively.
- **`src/infrastructure/i18n/catalog.ts`** — source of the supported-locale list that `frontendLink` consults to clamp unknown locales.
- **`src/infrastructure/i18n/index.ts`** — barrel that re-exports `resetSupportedLocales`, which `withEnv` calls before and after each env-mutating test to invalidate the cached locale list.

## Notes

- **Locale cache invalidation is mandatory.** The i18n module caches the supported-locale list at first read. Any test that changes `NODE_SUPPORTED_LOCALES` or `NODE_DEFAULT_LOCALE` must go through `withEnv` (or explicitly call `resetSupportedLocales`) or later tests will see stale locale data.
- **The `order` kind is structurally different.** It takes `id` (not `token`), embeds it in the path rather than a query string, and therefore never appears in the token-based distinctness assertion.
- **Per-kind template overrides are namespaced by kind.** Setting `NODE_FRONTEND_LINK_RESET` changes only the reset path; the test explicitly asserts the verify link is untouched to lock in that isolation.
