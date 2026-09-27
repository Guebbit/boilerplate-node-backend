---
source: tests/unit/infrastructure/http/frontend-link.test.ts
sha256: 52e10a83a582514b1a53edaa5a7053488050a933b957b419306588d6eaea3c3f
generated_at: 2026-09-27T16:06:15.483671+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/frontend-link.test.ts

## Purpose

Unit tests for the `frontendLink` helper, verifying that it correctly assembles a frontend URL from a template string, a locale, and optional parameters. Covers the three infrastructure responsibilities it owns: origin resolution, locale segment placement, and `{placeholder}` substitution with URL-encoding.

## Key elements

- **`TOKEN`** – a fixed hex string used as a sample parameter value across tests.
- **`withEnv(overrides, run)`** – local helper that snapshots the listed `process.env` keys, applies overrides (or deletes them if the value is `undefined`), calls `resetSupportedLocales()` to clear the cached locale list, executes `run()`, then restores the original env values and resets the cache again in a `finally` block.
- **`describe('placeholder substitution')`** – asserts single/multi placeholder fill, no-op when no placeholders exist, URL-encoding of values that would alter path shape, and that unused params are silently ignored.
- **`describe('the locale segment')`** – asserts locale is the first path segment after origin, and that an unsupported locale clamps to the deployment default (`NODE_DEFAULT_LOCALE`) rather than producing a broken path.
- **`describe('the origin')`** – asserts fallback to `http://localhost:8080` when `NODE_FRONTEND_URL` is unset, and that a set value is used as-is.

## Relationships

- **`src/infrastructure/http/frontend-link.ts`** – the unit under test; `frontendLink` is the sole function imported and exercised.
- **`src/infrastructure/i18n/index.ts`** – source of the `resetSupportedLocales` call inside `withEnv`; without this reset the cached supported-locale list would leak between tests that change `NODE_SUPPORTED_LOCALES`.
- **`src/infrastructure/i18n/catalog.ts`** – the concrete implementation behind the `resetSupportedLocales` re-export; tests that set `NODE_SUPPORTED_LOCALES` / `NODE_DEFAULT_LOCALE` depend on its internal cache being invalidated.

## Notes

- The locale-clamp test (`clamps an unsupported locale…`) requires **both** `NODE_SUPPORTED_LOCALES` and `NODE_DEFAULT_LOCALE` to be set in the same `withEnv` call; setting only one will not reproduce the behaviour.
- Default-origin tests rely on the i18n module's default locale being `en` when no env vars override it; if a global test setup changes that, the hardcoded `http://localhost:8080/en/…` expectation will break.
- The file header comment references design decision **D14** (domain modules own link kinds, env vars, and templates). Only infrastructure-level concerns are tested here; domain-specific template choices are out of scope.
