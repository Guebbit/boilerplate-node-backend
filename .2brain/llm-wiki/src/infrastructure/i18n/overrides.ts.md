---
source: src/infrastructure/i18n/overrides.ts
sha256: 9092518c23c68adfb0ad2ed133f4bf6d83d13faa3878daab6bf1e5542573e88e
generated_at: 2026-09-23T17:47:34.026289+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/i18n/overrides.ts

## Purpose

Database overlay for i18n: admin-edited translation copy layered on top of the static dictionary files under `./catalog`. The module is deliberately one-directional (nothing imports back into it) so the entire feature can be removed by deleting this file plus two boot-sequence lines at the composition root.

## Key elements

- **`LocaleOverrideProvider`** (type) — `() => Promise<Record<string, Record<string, unknown>>>`. Returns nested override trees keyed by locale. Nested (not flat) because only the `locales` module can safely expand dotted keys; infrastructure must not redo that.
- **`registerLocaleOverrideProvider`** — Sets (or clears) the provider. Called once at boot by the composition root. `undefined` is the valid default state (tests get deployed files only).
- **`resetLocaleOverrides`** — Restores every supported language to its deployed file via `i18next.addResourceBundle`. Used for shutdown and tests.
- **`applyLocaleOverrides`** — Resets all locales, then merges the given override trees with `deep: true, overwrite: true`. Skips and logs unsupported locales.
- **`refreshLocaleOverrides`** — Pulls overrides from the registered provider and applies them. Never rejects; a failed read leaves the last good overlay in place (stale copy preferred over reverting copy).
- **`getOverrideRefreshMs`** — Reads `NODE_LOCALE_OVERRIDE_REFRESH_MS` (default 60 000, min 1) via `environmentNumber`.
- **`startLocaleOverrideRefresh`** / **`stopLocaleOverrideRefresh`** — Start/stop an `unref`-ed interval that calls `refreshLocaleOverrides`, so edits made on one worker reach others within the staleness window.

## Relationships

- **`./catalog`** — Imports `listSupportedLocales` and `readLocaleDictionary` to determine supported locales and restore the file baseline.
- **`@infrastructure/adapters/logger`** — Imports `logger` for warn-level diagnostics on skipped locales and provider failures.
- **`@infrastructure/runtime/environment`** — Imports `environmentNumber` to read the refresh interval from the environment.
- **`src/infrastructure/i18n/index.ts`** — Barrel file; re-exports this module (and `catalog`) for external consumers.
- **`src/app.ts` / `src/app/demo.ts`** — Composition root: calls `registerLocaleOverrideProvider` and the two boot-sequence lines (`startLocaleOverrideRefresh` / `stopLocaleOverrideRefresh`).
- **`src/infrastructure/runtime/server-lifecycle.ts`** — Lifecycle hooks that call `startLocaleOverrideRefresh` at boot and `stopLocaleOverrideRefresh` at shutdown.
- **`src/modules/locales/controllers/*`** (`write-locale-entries`, `delete-locale-entry`, `delete-locale`) — Admin write paths that trigger `refreshLocaleOverrides` so the edit is visible without waiting for the next interval tick.
- **`tests/unit/infrastructure/i18n/overrides.test.ts`** — Unit tests exercising the apply/reset/refresh logic without a live database.

## Notes

- **Per-process state.** `i18next` resource bundles live in each worker's memory. The interval refresh (not a lease) is intentional: a lease would elect one runner and starve the other N−1 workers of the update. The doc comment explicitly rejects `withLease` for this reason.
- **Failure semantics.** A throwing provider is swallowed; the last successfully applied overlay stays. This is by design—stale copy is preferred over a bundle that reverts to file baseline on every transient DB error.
- **`unref` on the timer.** The interval never keeps the process alive. A worker that has nothing else to do exits cleanly even with a pending refresh.
- **Stryker pragmas.** `// Stryker disable all … // Stryker restore all` wraps the warn-only log paths so mutation testing doesn't flag the intentionally dead `throw` alternatives.
- **No cross-module expansion of dotted keys.** The override trees are already nested. The `locales` module owns the dotted-key → nested-object expansion (with `__proto__` guard) and is the only place that logic lives.
