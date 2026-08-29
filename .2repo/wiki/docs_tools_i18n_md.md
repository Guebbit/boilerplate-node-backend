# docs/tools/i18n.md

## Purpose

Documents how per-request locale resolution works in the API: why `t` is bound per-request via `getFixedT` + `AsyncLocalStorage` instead of using i18next's global instance, the four-file module layout behind `@infrastructure/i18n`, and the boundaries where the ambient `t` stops reaching code (queued work, boot-time callbacks, scripts).

## Key elements

- **`@infrastructure/i18n`** — barrel import used by every call site; no call site names an individual file.
- **`catalog.ts`** — defines which languages exist (`NODE_SUPPORTED_LOCALES` or directory listing) and the per-module dictionary merge.
- **`overrides.ts`** — database overlay (admin-editable copy) layered on top of file-based translations; includes a periodic refresh timer that re-reads the overlay.
- **`context.ts`** — the `AsyncLocalStorage` instance and the ambient `t` accessor that call sites import.
- **`negotiate.ts`** — converts an `Accept-Language` header into one supported locale.
- **`getFixedT(locale)`** — returns a `t` bound to one language without touching i18next's global state.
- **`runWithLocale`** — re-binds the locale for code that leaves the original async chain (e.g. queue workers).
- **`eslint/rules/no-hardcoded-user-text.ts`** — lint rule that enforces all user-facing strings go through `t`.
- **`tests/cross-cutting/locale-namespaces.test.ts`** — fails if a module shadows a shared key.

## Relationships

- **`docs/tools/index.md`** — the tools index page; links to this page as one of the infrastructure tool docs. No code-level dependency; purely navigational.

## Notes

- The only intra-directory dependency is `overrides.ts` → `catalog.ts` (one way). A project that drops admin-editable copy deletes `overrides.ts` and two boot lines, rather than editing `context.ts`.
- `i18next.init()` snapshots the resource list at boot and never re-reads it. The supported-locale list is cached to stay in sync with what i18next can actually resolve; adding a `src/locales/<locale>.json` file requires a restart.
- Outside a request (migrations, scripts, tests) `t` falls back to the boot locale silently — it never throws and never returns a raw key.
- Database overrides: the file baseline is fully restored before each refresh (prevents "deleted override sticks until restart"), and only languages that have a file on disk can be overridden (prevents negotiating a locale the instance cannot resolve).
- Cross-worker staleness for DB overrides is bounded by the refresh interval; each worker holds its own overlay copy.
