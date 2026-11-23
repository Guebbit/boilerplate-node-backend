---
source: src/modules/locales/services/index.ts
source_sha256: 698dc2e04270c45fdb8926bafc0b8a83829daeb92c269154ade7ba82cd87f302
context_sha256: bbe04f7a94468d748222f57fb8eb1c901b6bbd0e0a98e76b14a4ae6b6991cbc9
generated_at: 2026-11-22T05:47:35.336395+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/services/index.ts

## Purpose
Barrel file for the locale service layer (the "override tier"). It gathers the per-flow functions from sibling files into a single `localeService` namespace object. Controllers, `module.ts` and tests all import that one name rather than individual functions. The header notes that `t()` and the locale middleware never await these functions. The overrides they write reach `t()` only through an overlay rebuilt off the request path.

## Key elements
- `localeService` is the only export. It is a plain object that re-exposes every service function. The functions are grouped by source:
  - **Capabilities:** `isRightToLeft`, `describeLanguage`, `staticCapability`, `dynamicCapability`, `mergeCapabilities`, `readDynamicTier`, `callerScope`, `readStanding`, `listCapabilities`, `readLanguage`, `describeStoredLanguage`.
  - **Actions:** `standingOn`, `languageActions`.
  - **Apps:** `listApps`, imported from `../apps`.
  - **Keys:** `buildMessageTree`, `findUnsafeKeySegment`, `findKeyCollision`, `findBatchCollision`, `findDuplicateKey`.
  - **Messages:** `readMessages`, `readApiOverrides`, `readLocaleOverlay`.
  - **Languages:** `createLanguage`, `updateLanguage`, `activateLanguage`, `deactivateLanguage`, `removeLanguage`.
  - **Entries:** `searchEntries`, `getEntry`, `createEntry`, `updateEntry`, `removeEntry`, `importEntries`.
  - **Translatables and translations:** `setTranslatables`, `getEntityTranslations`, `updateEntityTranslations`, `replaceEntityTranslations`.
  - **Model helpers:** `localeDisplayName` and `normalizeTag`, imported from `../model`.

## Relationships
- The controllers listed as neighbors (`get-locales`, `post-locale`, `delete-locale`, `post-locale-activation`, the locale-entry controllers, `get-locale-messages`, `get-locale-apps`, and the entity-translation controllers) reach the service layer through this namespace.
- `../apps` is imported here, and `listApps` is exposed through the namespace.
- `src/modules/example/tests/integration/translations.test.ts` is a neighbor, and the header says tests import `localeService` too.
- `../model` is imported only for the two helpers above. The inline comment explains this: controllers may not import `../model` directly (the persistence wall), so the two controllers that validate a display name use these helpers through the service.

## Notes
- Do not add loose re-exports beside `localeService`. The file comment says a second list of every function would have to be kept in step with the folder.
- A new service function must be both imported and added to the `localeService` object to be reachable.
- The layout follows a "one file per flow" convention, per the file's header comment.
