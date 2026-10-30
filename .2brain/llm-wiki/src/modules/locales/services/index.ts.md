---
source: src/modules/locales/services/index.ts
sha256: add0d4d31af790116413f3a52c4804bca2e0410017749915ee1b9ab325958ddb
generated_at: 2026-10-29T04:23:36.155626+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/index.ts

## Purpose

Facade for the locale **override tier**. It aggregates every function from the sibling service modules (`keys`, `capabilities`, `actions`, `languages`, `entries`, `messages`, `translatables`, `translations`) plus two items from outside `services/` (`listApps`, `localeDisplayName`) into a single `localeService` object. It exists so that controllers, `module.ts`, and tests all import from **one name** rather than reaching into individual files. Nothing here is ever awaited by `t()` or the locale middleware; writes flow to `t()` only via a request-path overlay rebuild.

## Key elements

- **`localeService`** (the sole export) — a frozen-shaped object literal bundling:
  - *Capability helpers*: `isRightToLeft`, `describeLanguage`, `staticCapability`, `dynamicCapability`, `mergeCapabilities`, `readDynamicTier`, `callerScope`, `readStanding`, `listCapabilities`, `readLanguage`, `describeStoredLanguage` (from `./capabilities`)
  - *Key validation*: `buildMessageTree`, `findUnsafeKeySegment`, `findKeyCollision`, `findBatchCollision`, `findDuplicateKey` (from `./keys`)
  - *Standing & actions*: `standingOn`, `languageActions` (from `./actions`)
  - *App listing*: `listApps` (from `../apps`)
  - *Language CRUD*: `createLanguage`, `updateLanguage`, `activateLanguage`, `deactivateLanguage`, `removeLanguage` (from `./languages`)
  - *Entry CRUD + import*: `searchEntries`, `getEntry`, `createEntry`, `updateEntry`, `removeEntry`, `importEntries` (from `./entries`)
  - *Message/overlay reads*: `readMessages`, `readApiOverrides`, `readLocaleOverlay` (from `./messages`)
  - *Translatables*: `setTranslatables` (from `./translatables`)
  - *Entity translations*: `getEntityTranslations`, `updateEntityTranslations`, `replaceEntityTranslations` (from `./translations`)
  - *Model helper*: `localeDisplayName` (from `../model`) — proxied here because controllers may not import `../model` directly (persistence wall).

## Relationships

- **Imported by every controller** in `src/modules/locales/controllers/` (`activate-locale`, `create-locale`, `delete-locale`, `delete-locale-entry`, `get-locale-apps`, `get-locale-entries`, `get-locale-messages`, `get-locales`, `get-entity-translations`, `update-locale`, `write-locale-entries`, `write-entity-translations`). They call `localeService.<fn>` rather than importing the underlying modules.
- **Re-exports `listApps`** from `src/modules/locales/apps.ts`, making that file indirectly reachable through the service.
- **Re-exports `localeDisplayName`** from `src/modules/locales/model.ts`, bridging the persistence-wall restriction for controllers that validate display names.
- **Imported by `src/modules/locales/index.ts`** (module entry point) and by `src/modules/example/tests/integration/translations.test.ts` for integration coverage.

## Notes

- There is intentionally **no second export list** (no named re-exports alongside the object). The comment warns that a parallel named list would drift out of sync with the folder. If you add a function to a sibling module, add it to the `localeService` object only.
- The file is a **pure re-export barrel with zero logic** — no side-effects, no initialization. Safe to import at any layer.
- Because `localeService` is the single entry point, TypeScript's object-literal type is the *only* public type surface; there is no `interface` or `type` export to keep in lockstep.
