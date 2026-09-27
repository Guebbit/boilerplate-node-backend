---
source: src/infrastructure/i18n/overrides.ts
sha256: f43741464b37d2911585bde2bd1a3021346d1ea13a7216d8dcc0cdfa92554b4e
generated_at: 2026-09-27T14:12:20.743878+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/i18n/overrides.ts

## Purpose

Implements the database overlay for i18n translations: admin-edited copy layered on top of the deployed dictionary files under `./catalog`. It is deliberately isolated — nothing in the codebase imports this module back — so the entire feature can be removed by deleting this file and its two boot-sequence call sites.

## Key elements

- **`LocaleOverrideProvider`** (type) — A function returning `Promise<Record<string, Record<string, unknown>>>`, i.e. nested override trees keyed by locale. Nested rather than flat so the `locales` module (the only safe key-expander) stays the sole authority on dotted-key resolution.
- **`registerLocaleOverrideProvider(provider?)`** — Sets or clears the module-level provider. Called by the composition root; passing `undefined` is the valid "no overrides" state used by unit tests.
- **`isLocaleOverrideAvailable()`** — Returns whether a provider is registered. Used by the caller before starting the refresh timer to avoid a no-op interval.
- **`resetLocaleOverrides()`** — Synchronously restores every supported locale to its deployed file via `i18next.addResourceBundle`. Used for shutdown and tests, **not** as the failure path.
- **`applyLocaleOverrides(overridesByLocale)`** — Calls `resetLocaleOverrides()` first (synchronously, so no observer sees a transient file-only state), then merges each locale's nested overrides with `deep` and `overwrite` both true. Logs a warning for locales that have no deployed dictionary.
- **`refreshLocaleOverrides()`** — Pulls overrides from the registered provider and applies them. Never rejects: a failed DB read logs a warning and keeps the last-good overlay.
- **`getOverrideRefreshMs()`** — Reads `NODE_LOCALE_OVERRIDE_REFRESH_MS` (default 60 000) via `environmentNumber`.
- **`startLocaleOverrideRefresh()`** — Starts a `setInterval` (unref'd) that calls `refreshLocaleOverrides` on the configured period. Idempotent.
- **`stopLocaleOverrideRefresh()`** — Clears the interval and resets the handle. Called by shutdown and tests.

## Relationships

- **`./catalog`** — Imports `listSupportedLocales` and `readLocaleDictionary` to enumerate supported languages and read the file baseline for reset/apply.
- **`@infrastructure/adapters/logger`** — Imports `logger` for the two warning paths (skipped locales, unavailable provider).
- **`@infrastructure/runtime/environment`** — Imports `environmentNumber` to resolve the refresh interval from the environment.
- **`src/app.ts` / `src/app/demo.ts`** — Boot-sequence callers: register the provider, start the refresh timer on startup, stop it on shutdown.
- **`src/modules/locales/module.ts` / `src/modules/locales/services/overlay.ts`** — The composition root and the database-backed provider that gets registered here.
- **`src/infrastructure/i18n/index.ts`** — Barrel file; re-exports (or omits) this module's API.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — Likely the shutdown hook that calls `stopLocaleOverrideRefresh`.
- **`tests/unit/infrastructure/i18n/overrides.test.ts`** — Unit tests exercising apply/reset/refresh behaviour without a running server.

## Notes

- **Isolation contract:** Nothing imports this module. Deleting the file plus its two boot-sequence lines removes the feature with zero refactor.
- **Failure semantics:** A provider that throws leaves the last-good overlay intact (stale copy is preferable to a self-reverting one). `resetLocaleOverrides` is explicitly *not* the failure path.
- **Per-process state:** The i18next resource bundle is per-worker. The refresh interval is therefore **not** behind a lease — every worker must apply its own copy, or N-1 workers stay stale indefinitely.
- **Unref'd timer:** `startLocaleOverrideRefresh` calls `.unref()` so the interval never prevents the process from exiting.
- **Stryker suppression:** The two `logger.warn` branches are wrapped in `// Stryker disable all` / `restore all` to keep mutation-testing coverage honest without penalising the intentional no-op catch.
