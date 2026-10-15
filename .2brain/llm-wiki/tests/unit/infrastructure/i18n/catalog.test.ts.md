---
source: tests/unit/infrastructure/i18n/catalog.test.ts
sha256: 24c65512ffcb2dc5eb9dd1868ca679466558bb3d58c03270bdddc8b49a91a322
generated_at: 2026-10-15T13:16:26.270951+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/i18n/catalog.test.ts

## Purpose

Unit tests for the i18n catalog module, covering locale discovery, per-locale dictionary loading with module-level merging, the shape handed to `i18next.init()`, the deep-copy cache semantics, and the `localeCandidatesFor` negotiation chain. The file exists to guard against the most consequential failure mode: the supported-locales list drifting from the resources `i18next` actually registered, which would let negotiation offer a language the instance cannot resolve.

## Key elements

- **`describe('locale discovery')`** — verifies `listSupportedLocales` returns the expected set, honours `NODE_SUPPORTED_LOCALES` (via `resetSupportedLocales`), and stays cached across subsequent calls so it cannot drift.
- **`readLocaleDictionary` tests** — confirm the returned object carries the shared translation verbatim *and* layers each registered module's namespace (asserted per-module, e.g. `users`) on top.
- **`loadLocaleResources` test** — asserts the top-level `{ locale: { translation: … } }` shape that `i18next.init()` consumes.
- **CWD-independence test** — calls `process.chdir('/')` and verifies `readLocaleDictionary` still resolves the shared directory from the module's own location, not `process.cwd()`.
- **`describe('the merged dictionary cache')`** — asserts each call returns a deep copy (`toEqual` but `not.toBe`), that mutations do not leak between reads, and that `registerLocaleDirectories` (called on a fresh module instance via `jest.isolateModulesAsync`) picks up newly-added locale files.
- **`describe('localeCandidatesFor')`** — validates the candidate chain (`it-CH → it → en`), deduplication of a base tag, of the fallback itself, and of a region-tagged fallback.

## Relationships

- **`src/infrastructure/i18n/index.ts`** — barrel module the test imports five named exports (`listSupportedLocales`, `loadLocaleResources`, `localeCandidatesFor`, `readLocaleDictionary`, `resetSupportedLocales`) from via the `@infrastructure/i18n` alias.
- **`src/infrastructure/i18n/catalog.ts`** — the concrete module under test; imported directly (not through the barrel) inside the `jest.isolateModulesAsync` block to access `registerLocaleDirectories` and to obtain a fresh module instance with its own cache.
- **`tests/support/environment.ts`** — provides `setEnvironment`, used to set/clear `NODE_SUPPORTED_LOCALES` and `NODE_FALLBACK_LOCALE` deterministically for each test.

## Notes

- The `isolatedModules` test writes a temporary locale file, calls `catalog.registerLocaleDirectories([dir])`, then cleans up. It relies on `jest.isolateModulesAsync` to get a fresh module instance; calling `registerLocaleDirectories` on the shared singleton would pollute other tests.
- `resetSupportedLocales` is a test-only escape hatch for re-reading `NODE_SUPPORTED_LOCALES`; it is imported through the barrel and must be called in a `finally` block (as done here) to avoid leaking state.
- The `process.chdir('/')` test restores the original CWD in a `finally` block—forgetting this would break subsequent tests that resolve paths relative to the project root.
- Fixture JSON files are imported statically (`en.json`, `it.json`, `enUsers`, `itUsers`) so tests assert against the *actual* shipped translations rather than inline literals.
