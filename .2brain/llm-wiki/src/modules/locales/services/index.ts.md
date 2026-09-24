---
source: src/modules/locales/services/index.ts
sha256: 41a0088c4da216137573fb7e4fa9e7c95d8f51b4fb39a9b183f9ea8a2d884585
generated_at: 2026-09-23T18:51:43.902525+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/index.ts

## Purpose

Barrel/facade for the locales service layer. It aggregates every public function from the sub-modules (`keys`, `capabilities`, `entries`, `languages`, `messages`, `translatables`, `translations`, and `tenants`) into a single `localeService` object, giving controllers, `module.ts`, and tests exactly one import target. The module exists as a folder (not one file) because the service crossed ~300 lines; see `docs/theory/layers.md`.

## Key elements

- **`localeService`** (const, the sole export) — a flat object exposing 26 named functions grouped by domain:
  - *Capabilities:* `isRightToLeft`, `describeLanguage`, `staticCapability`, `dynamicCapability`, `mergeCapabilities`, `readDynamicTier`, `callerScope`, `listCapabilities`
  - *Key safety:* `buildMessageTree`, `findUnsafeKeySegment`, `findKeyCollision`, `findBatchCollision`, `findDuplicateKey`
  - *CRUD / data:* `listTenants`, `readMessages`, `readApiOverrides`, `createLanguage`, `updateLanguage`, `deleteLanguage`, `searchEntries`, `createEntry`, `updateEntry`, `deleteEntry`, `importEntries`, `setTranslatables`, `getEntityTranslations`, `upsertEntityTranslations`
- **No individual named re-exports** — the header comment explicitly forbids a second `export { … }` list beside the namespace to avoid a stale duplicate.

## Relationships

- **Consumers (controllers):** `delete-locale.ts`, `delete-locale-entry.ts`, `get-locale-entries.ts`, `get-locale-messages.ts`, `get-locale-tenants.ts`, `get-locales.ts`, `get-entity-translations.ts`, `upsert-entity-translations.ts`, `write-locale-entries.ts`, `write-locales.ts` all import `localeService` from this file rather than reaching into sub-modules directly.
- **Module wiring:** `src/modules/locales/index.ts` and `src/modules/locales/module.ts` reference `localeService` for registration / barrel re-export at the module level.
- **Supplied-by (graph neighbors):** `services/capabilities.ts`, `services/entries.ts`, and `services/keys.ts` are the sub-module files whose functions are re-assigned into `localeService` here. (The file also imports from `./languages`, `./messages`, `./translatables`, `./translations`, and `../tenants`, but those are not part of the tracked dependency graph.)

## Notes

- **Nothing here is ever `await`ed by `t()` or the locale middleware.** The overrides these functions write reach `t()` only through a separate overlay rebuilt off the request path. Do not assume calling a `localeService` function updates the active translation context synchronously.
- **Single-export contract:** adding a new function to the service layer means adding it to the `localeService` object literal. Do not add a separate `export { fn }` line; the comment at the top of the file is a deliberate guard against a second list drifting out of sync.
- The file is intentionally a pure object-literal re-assignment; there is no logic, no side-effects, and no initialization beyond the import bindings.
