# src/modules/locales/services/index.ts

## Purpose

Barrel (namespace) file that re-exports every public function from the five locale-service sub-modules into a single `localeService` object. It exists so that the seven controllers, `module.ts`, and the integration test suite all import one name rather than a list of twenty-four scattered exports, keeping the re-export surface trivially in sync with the folder.

## Key elements

- **`localeService`** (sole export) — a frozen object bundling 24 functions drawn from five sibling files:
  - `keys.ts` → `buildMessageTree`, `findUnsafeKeySegment`, `findKeyCollision`, `findBatchCollision`, `findDuplicateKey`
  - `capabilities.ts` → `isRightToLeft`, `describeLanguage`, `staticCapability`, `dynamicCapability`, `mergeCapabilities`, `readDynamicTier`, `callerScope`, `listCapabilities`, `listTenants`
  - `languages.ts` → `createLanguage`, `updateLanguage`, `deleteLanguage`
  - `entries.ts` → `searchEntries`, `createEntry`, `updateEntry`, `deleteEntry`, `importEntries`
  - `messages.ts` → `readMessages`, `readApiOverrides`

## Relationships

- **Imported by all seven locale controllers** (`get-locales`, `write-locales`, `delete-locale`, `get-locale-entries`, `write-locale-entries`, `delete-locale-entry`, `get-locale-messages`, `get-locale-tenants`) — each pulls specific functions off `localeService` to implement its endpoint.
- **Imported by `module.ts`** — wires the service into the module's DI / route registration.
- **Imported by `tests/integration/model.test.ts`** — exercises the same surface the controllers use.
- **Re-exports from five sibling files** (`keys.ts`, `capabilities.ts`, `languages.ts`, `entries.ts`, `messages.ts`) — the actual implementations live there; this file adds no logic.

## Notes

- There are **no loose named re-exports** (`export { foo } from …`). The only importable name is `localeService`. Adding a second export list is explicitly discouraged by the in-file comment.
- Architectural invariant stated in the header: **nothing exported here is ever awaited by `t()`, `negotiateLocale`, or the locale middleware at request time.** All functions are database-backed and live on the admin/override path.
- `readApiOverrides` is the one read that the middleware *does* consult, but only via a request-time overlay rebuild — the set of languages the API can answer in is still fixed at boot from deployed files and cannot be changed by a DB row.
- The file was split out of a single ~300-line module; the rationale lives in `docs/theory/layers.md`.
