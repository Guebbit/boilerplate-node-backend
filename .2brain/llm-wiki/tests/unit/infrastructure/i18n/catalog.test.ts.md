---
source: tests/unit/infrastructure/i18n/catalog.test.ts
sha256: 7025f372fc1f95c3b7b5d24ed640d376549b986a69f08626d6136203d9690c9f
generated_at: 2026-11-08T10:19:22.247545+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/i18n/catalog.test.ts

## Purpose

Unit tests for the i18n catalog module, covering locale discovery (listing, caching, env-var override), per-module dictionary merging, the shape handed to `i18next.init()`, the merged-dictionary cache's copy-on-read semantics, and the locale-candidate chain builder. The tests exist to guard against drift between the locale list i18next registered from and what the API advertises, and to ensure cached dictionaries are never shared mutable objects.

## Key elements

- **`describe('locale discovery')`** — Verifies `listSupportedLocales` returns expected locales, honours `NODE_SUPPORTED_LOCALES` (via `setEnvironment` + `resetSupportedLocales`), is cached after first read (env change post-initialisation does not alter the list), and that `readLocaleDictionary` merges shared + module namespaces. Also asserts `loadLocaleResources` produces the `{ locale: { translation: … } }` shape and that resolution is cwd-independent.
- **`describe('the merged dictionary cache')`** — Confirms `readLocaleDictionary` returns equal-but-distinct objects (no shared tree), that mutations to one result don't leak into the next read, and that `registerLocaleDirectories` (accessed through a fresh `jest.isolateModulesAsync` import of `@infrastructure/i18n/catalog`) picks up newly registered directories.
- **`describe('localeCandidatesFor')`** — Validates the exact → base → fallback candidate chain, including deduplication when the requested locale equals the fallback or when the fallback itself is region-tagged.
- **Fixtures** — Static imports of `en.json`/`it.json` from `shared/locales` and `@modules/users/locales` serve as expected-value baselines for merge and shape assertions.

## Relationships

- **`src/infrastructure/i18n/index.ts`** — The test imports `listSupportedLocales`, `loadLocaleResources`, `localeCandidatesFor`, `readLocaleDictionary`, and `resetSupportedLocales` from the `@infrastructure/i18n` barrel, which re-exports them from `catalog.ts`.
- **`src/infrastructure/i18n/catalog.ts`** — The module under test. One test bypasses the barrel (`jest.isolateModulesAsync` + direct `import('@infrastructure/i18n/catalog')`) to access the non-exported `registerLocaleDirectories` and verify dynamic directory registration.
- **`tests/support/environment.ts`** — Provides `setEnvironment`, used to inject `NODE_SUPPORTED_LOCALES` and `NODE_FALLBACK_LOCALE` before calling the catalog functions.

## Notes

- The caching test deliberately sets `NODE_SUPPORTED_LOCALES` *after* the first `listSupportedLocales()` call to prove the list is frozen at initialisation time; forgetting this ordering makes the test vacuous.
- The mutation-leak test relies on `toEqual` (deep) vs `toBe` (reference) to distinguish "correctly equal" from "accidentally the same object."
- The `registerLocaleDirectories` test uses `jest.isolateModulesAsync` to get a fresh module instance, because the shared module singleton already holds the app's registered directories. It also creates/cleans a temp directory with `mkdtempSync`/`rmSync`.
- The cwd-independence test does `process.chdir('/')` inside a `try/finally` to restore the original directory; if the assertion throws, the `finally` still restores cwd, but the test process continues in `/` until that line executes.
