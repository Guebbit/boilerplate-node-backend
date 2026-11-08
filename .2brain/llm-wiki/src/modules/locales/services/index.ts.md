---
source: src/modules/locales/services/index.ts
sha256: add0d4d31af790116413f3a52c4804bca2e0410017749915ee1b9ab325958ddb
generated_at: 2026-11-08T06:25:26.617218+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/index.ts

## Purpose

Single-entry-point facade for the locale service layer. Aggregates every function that the locales feature exposes to controllers, `module.ts`, and tests under one name — `localeService` — so that nothing outside `services/` needs to know the internal file layout. It is the "override tier" boundary: the rules and operations that make it safe to ask the locale system to write, validate, and restructure translation data.

## Key elements

- **`localeService`** (exported const) — the sole export of this module. A flat object that re-exports every function from the sub-modules listed below. Controllers, tests, and `module.ts` import only this name.
- **`./keys`** — key-tree utilities: `buildMessageTree`, `findUnsafeKeySegment`, `findKeyCollision`, `findBatchCollision`, `findDuplicateKey`.
- **`./capabilities`** — language/capability queries: `isRightToLeft`, `describeLanguage`, `staticCapability`, `dynamicCapability`, `mergeCapabilities`, `readDynamicTier`, `callerScope`, `readStanding`, `listCapabilities`, `readLanguage`, `describeStoredLanguage`.
- **`./actions`** — `standingOn`, `languageActions`.
- **`../apps`** — `listApps` (pulled from the sibling `apps.ts` module).
- **`./languages`** — CRUD + lifecycle: `createLanguage`, `updateLanguage`, `activateLanguage`, `deactivateLanguage`, `removeLanguage`.
- **`./entries`** — entry CRUD + bulk: `searchEntries`, `getEntry`, `createEntry`, `updateEntry`, `removeEntry`, `importEntries`.
- **`./messages`** — read paths: `readMessages`, `readApiOverrides`, `readLocaleOverlay`.
- **`./translatables`** — `setTranslatables`.
- **`./translations`** — entity-scoped translations: `getEntityTranslations`, `updateEntityTranslations`, `replaceEntityTranslations`.
- **`../model`** — `localeDisplayName` (display-name helper, proxied here because of the persistence wall).

## Relationships

- **`src/modules/locales/apps.ts`** — provides `listApps`, consumed directly by this facade.
- **Controllers (`delete-locale-entry`, `delete-locale`, `get-entity-translations`, `get-locale-apps`, `get-locale-entries`, `get-locale-messages`, `get-locales`, `post-locale-activation`, `post-locale-entry`, `post-locale`, `put-locale-entry`, `update-entity-translations`, `update-locale-entries`)** — all import `localeService` from this file to call their respective operations. They never import the sub-modules directly.
- **`src/modules/example/tests/integration/translations.test.ts`** — imports `localeService` for integration-level assertions.

## Notes

- **No loose re-exports.** The file deliberately avoids a second named-export list alongside the namespace object. Adding or removing a function means editing only the `localeService` literal.
- **Not awaited by `t()` or locale middleware.** The overrides written through these functions reach `t()` only via a separately rebuilt overlay on the request path. Treating this module as a synchronous call surface (not a runtime translation path) is a core design invariant.
- **Persistence wall.** Controllers must not import from `../model` directly. `localeDisplayName` is surfaced through this facade specifically to keep that boundary intact. If a controller needs another `model` symbol, add it here rather than importing `../model` in the controller.
- **One file per flow.** The file header references `docs/theory/layers.md` for the layering rationale; this index is the aggregation layer on top of those per-flow files.
