# src/modules/locales/services/index.ts

## Purpose

Barrel file for the locales service tier. It aggregates functions from five sub-modules (`keys`, `capabilities`, `languages`, `entries`, `messages`) into a single `localeService` namespace object, which is the **only** name anything outside `services/` imports. It exists so consumers get one stable import target instead of 24 individual re-exports that would drift out of sync with the folder.

## Key elements

- **`localeService`** (exported object) — the sole export of this module. Contains all 24 functions the locale service exposes, grouped by sub-module:
  - *Capabilities:* `isRightToLeft`, `describeLanguage`, `staticCapability`, `dynamicCapability`, `mergeCapabilities`, `readDynamicTier`, `callerScope`, `listCapabilities`, `listTenants`
  - *Keys:* `buildMessageTree`, `findUnsafeKeySegment`, `findKeyCollision`, `findBatchCollision`, `findDuplicateKey`
  - *Languages:* `createLanguage`, `updateLanguage`, `deleteLanguage`
  - *Entries:* `searchEntries`, `createEntry`, `updateEntry`, `deleteEntry`, `importEntries`
  - *Messages:* `readMessages`, `readApiOverrides`

## Relationships

- **Imports from** (the five sub-modules it re-exports): `./keys`, `./capabilities`, `./languages`, `./entries`, `./messages`.
- **Imported by** (all consume the single `localeService` object): the seven locale controllers (`get-locales`, `write-locales`, `get-locale-entries`, `write-locale-entries`, `get-locale-messages`, `get-locale-tenants`, `delete-locale-entry`, `delete-locale`), `module.ts`, and three test suites including `tests/integration/model.test.ts`.

## Notes

- **No loose re-exports.** The file deliberately avoids `export { fn }` alongside the namespace object. Adding a second list of 24 names would double the maintenance surface; `localeService` is the one and only importable name.
- **Not on the hot path.** The header doc-block states that nothing here is ever `await`ed by `t()`, `negotiateLocale`, or the locale middleware. Overrides written by these functions reach `t()` only through an overlay rebuilt off the request path.
- **Folder, not file.** The service was split from a single file into this folder structure once it exceeded ~300 lines (see `docs/theory/layers.md` for the threshold policy).
