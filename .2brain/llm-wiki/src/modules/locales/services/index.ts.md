---
source: src/modules/locales/services/index.ts
sha256: 5e902924749ced1aaf67311c6715a63613a7c4782d27d015f5f783b31e3719d3
generated_at: 2026-10-15T10:45:38.697622+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/index.ts

## Purpose

Barrel (namespace) file that aggregates every function the locale service layer exposes into a single `localeService` object. It exists so that controllers, `module.ts`, and tests all import **one** name rather than maintaining a parallel re-export list. It is the "override tier" — the write/read API for locale data that ultimately feeds `t()` via a request-path overlay, never synchronously.

## Key elements

- **`localeService`** (exported const) — the sole export of this file. A flat object whose keys are the individual service functions (languages, entries, messages, capabilities, translations, key validation, translatables). This is the only symbol anything outside `services/` is expected to import.
- **Re-exposed: `localeDisplayName`** (from `../model`) — included here because controllers sit behind a "persistence wall" and cannot import `../model` directly; two display-name validators route through the service instead.
- **Imports (aggregated, not re-exported individually):**
  - `./keys` — `buildMessageTree`, `findUnsafeKeySegment`, `findKeyCollision`, `findBatchCollision`, `findDuplicateKey`
  - `./capabilities` — RTL check, language description, static/dynamic capability read/merge, tier read, caller scope, capability listing
  - `../apps` — `listApps`
  - `./languages` — `createLanguage`, `updateLanguage`, `deleteLanguage`
  - `./entries` — `searchEntries`, `createEntry`, `updateEntry`, `deleteEntry`, `importEntries`
  - `./messages` — `readMessages`, `readApiOverrides`
  - `./translatables` — `setTranslatables`
  - `./translations` — `getEntityTranslations`, `upsertEntityTranslations`, `replaceEntityTranslations`
  - `../model` — `localeDisplayName`

## Relationships

- **Controllers** (`create-locale`, `delete-locale`, `delete-locale-entry`, `get-locales`, `get-locale-apps`, `get-locale-entries`, `get-locale-messages`, `get-entity-translations`, `update-locale`, `write-locale-entries`, `write-entity-translations`) — each imports `localeService` and calls the relevant function(s). No controller imports the sub-module files directly.
- **`src/modules/locales/module.ts`** — registers/injects `localeService` for DI; it is the binding point between this file and the framework.
- **`src/modules/locales/model.ts`** — source of `localeDisplayName`, re-exposed here to bypass the controller→model persistence wall.
- **`src/modules/locales/apps.ts`** — source of `listApps`, pulled into the namespace.
- **`src/modules/locales/index.ts`** — module-level barrel that re-exports `localeService` (and possibly `module`) upward.

## Notes

- **No individual function re-exports.** The file deliberately avoids a second `export { … }` list; `localeService` is the single entry point. If you add a function to a sub-module, add its key to the `localeService` object — do not create a parallel named export here.
- **Not awaited on the hot path.** Per the module doc comment, nothing in this service is ever `await`-ed by `t()` or the locale middleware. Written overrides propagate to `t()` only through an overlay that is rebuilt off the request path.
- **Folder, not single file.** The service lives in `services/` as a directory (`keys.ts`, `capabilities.ts`, `languages.ts`, etc.) because it exceeded ~300 lines (see `docs/theory/layers.md`); this `index.ts` is the public face of that folder.
