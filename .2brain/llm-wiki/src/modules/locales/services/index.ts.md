---
source: src/modules/locales/services/index.ts
sha256: 4d7972027092bfdfdd4f69286b577afc74953d32260dea8b31fd62d9ae618368
generated_at: 2026-11-14T20:21:46.158046+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/index.ts

## Purpose

Barrel file that aggregates every function under `src/modules/locales/services/` into a single `localeService` namespace object. It is the **only** import surface for controllers, `module.ts`, and tests—no file outside `services/` reaches the individual sub-modules directly. It exists so the persistence wall (controllers must not import `../model` or raw sub-service files) stays intact.

## Key elements

- **`localeService`** (exported const) — a plain object whose keys are the full public API of the locale service. Every function listed below is a key on this object; there are no individual named re-exports.
  - *Capabilities & language* — `isRightToLeft`, `describeLanguage`, `staticCapability`, `dynamicCapability`, `mergeCapabilities`, `readDynamicTier`, `callerScope`, `readStanding`, `listCapabilities`, `readLanguage`, `describeStoredLanguage` (from `./capabilities`).
  - *Standing & actions* — `standingOn`, `languageActions` (from `./actions`).
  - *Apps* — `listApps` (from `../apps`).
  - *Keys / message tree* — `buildMessageTree`, `findUnsafeKeySegment`, `findKeyCollision`, `findBatchCollision`, `findDuplicateKey` (from `./keys`).
  - *Messages / overrides* — `readMessages`, `readApiOverrides`, `readLocaleOverlay` (from `./messages`).
  - *Languages* — `createLanguage`, `updateLanguage`, `activateLanguage`, `deactivateLanguage`, `removeLanguage` (from `./languages`).
  - *Entries* — `searchEntries`, `getEntry`, `createEntry`, `updateEntry`, `removeEntry`, `importEntries` (from `./entries`).
  - *Translatables* — `setTranslatables` (from `./translatables`).
  - *Entity translations* — `getEntityTranslations`, `updateEntityTranslations`, `replaceEntityTranslations` (from `./translations`).
  - *Model helpers* — `localeDisplayName`, `normalizeTag` (from `../model`; proxied here because controllers cannot import `../model` directly).

## Relationships

- **Controllers** (`get-locales`, `get-locale-entries`, `get-locale-messages`, `get-locale-apps`, `get-entity-translations`, `post-locale`, `post-locale-entry`, `post-locale-activation`, `put-locale-entry`, `update-locale-entries`, `update-entity-translations`, `delete-locale`, `delete-locale-entry`) all import `localeService` from this file and call its methods. No controller imports the sub-service files directly.
- **`../apps`** — `listApps` is re-exported through this namespace so controllers can reach it without crossing into the persistence layer.
- **`../model`** — `localeDisplayName` and `normalizeTag` are proxied here specifically to give `post-locale` and `put-locale-entry` a legal path to those two helpers without importing `../model` themselves.
- **`src/modules/example/tests/integration/translations.test.ts`** — exercises the entity-translation methods exposed on `localeService`.

## Notes

- Nothing in this file (and none of the functions it exposes) is **awaited** by `t()` or the locale middleware at runtime. Overrides written by these functions reach `t()` only via an overlay that is rebuilt on the request path. Treating them as synchronous "write to store" operations, not as part of the translation hot path, is intentional.
- There is deliberately **no** second list of named re-exports beside `localeService`. The file comment warns that a parallel `export { foo, bar, … }` list would duplicate the key list and drift out of sync as functions are added or removed.
- `localeService` is a plain object, not a class or a proxy—callers destructure or dot-access properties directly (e.g. `localeService.createEntry(…)`).
