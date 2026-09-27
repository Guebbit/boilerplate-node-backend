---
source: src/modules/locales/services/index.ts
sha256: 4436846d0716831e0e6c7f76d30970f19c860e5c4f72a3734ccca9a529d48d27
generated_at: 2026-09-27T15:01:11.470892+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/index.ts

## Purpose

Barrel that bundles every function the locales service layer exposes into a single `localeService` namespace object. It exists so that controllers, `module.ts`, and tests all import one name rather than a list of individual functions, keeping the public surface to a single point of change when the underlying folder (which grew past ~300 lines) is refactored.

## Key elements

- **`localeService`** (the sole export) — a plain object whose properties are the full set of locale service functions:
  - *Key utilities* — `buildMessageTree`, `findUnsafeKeySegment`, `findKeyCollision`, `findBatchCollision`, `findDuplicateKey` (from `./keys`)
  - *Capability helpers* — `isRightToLeft`, `describeLanguage`, `staticCapability`, `dynamicCapability`, `mergeCapabilities`, `readDynamicTier`, `callerScope`, `listCapabilities` (from `./capabilities`)
  - *Tenant listing* — `listTenants` (from `../tenants`)
  - *Language CRUD* — `createLanguage`, `updateLanguage`, `deleteLanguage` (from `./languages`)
  - *Entry CRUD & import* — `searchEntries`, `createEntry`, `updateEntry`, `deleteEntry`, `importEntries` (from `./entries`)
  - *Message reading* — `readMessages`, `readApiOverrides` (from `./messages`)
  - *Translatables* — `setTranslatables` (from `./translatables`)
  - *Entity translations* — `getEntityTranslations`, `upsertEntityTranslations`, `replaceEntityTranslations` (from `./translations`)
  - *Display-name helper* — `localeDisplayName` (re-exported from `../model` so controllers need not cross the persistence wall themselves)

## Relationships

- **Controllers** (`create-locale.ts`, `delete-locale.ts`, `delete-locale-entry.ts`, `get-locales.ts`, `get-locale-entries.ts`, `get-locale-messages.ts`, `get-locale-tenants.ts`, `get-entity-translations.ts`, `update-locale.ts`, `write-locale-entries.ts`, `write-entity-translations.ts`) import `localeService` from this file and call the relevant property for each route handler.
- **`src/modules/locales/module.ts`** imports `localeService` for DI registration.
- **`src/modules/locales/routes.ts`** binds the controllers (which in turn use `localeService`) to HTTP paths.
- **`src/modules/locales/model.ts`** is the origin of `localeDisplayName`, re-exposed here specifically because controllers are not permitted to import `../model` directly.
- **`src/modules/locales/index.ts`** (module barrel) re-exports this service index outward.

## Notes

- No function in `localeService` is ever awaited synchronously by `t()` or the locale middleware; writes reach `t()` only through a separate overlay rebuilt off the request path.
- The file deliberately avoids a second "loose re-export" list beside the namespace object — the single `localeService` object is the one and only way to reference any of these functions from outside `services/`.
- `localeDisplayName` is the one property sourced from `../model` rather than a local sub-module; it exists here to keep controllers from importing the model layer directly (the "persistence wall" convention).
