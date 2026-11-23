---
source: src/kernel/translation.ts
source_sha256: 6b8f474b11b39f3e94d4927f2fa363b10f74ddfe49f10b1bba93e13139b30096
context_sha256: 32c6e7770461a2af7451b16b3597f675d57b2e66a5fcfa00deb18728ef37babe
generated_at: 2026-11-22T03:14:57.369430+00:00
model: claude-code:claude-sonnet-5-5
---

# src/kernel/translation.ts

## Purpose
Defines the kernel's "translation port": a hook through which read paths resolve user-authored content (a product's title, a category's description) into the caller's language, and through which a hard delete removes an entity's translation rows. `modules/locales` registers the implementation, mirroring how `src/kernel/authentication.ts`'s `AuthResolver` is registered by `account`. Code such as a `createRepository` decorator can therefore depend on translation without importing `src/modules/*` and creating a cycle.

## Key elements
- **Types**
  - `TranslatedFields`: `Record<string, string>`. An absent key means untranslated, never an empty string.
  - `TranslationFieldChanges`: one locale's write in RFC 7396 style. A string sets the field, `null` clears it, and an absent key leaves it alone.
  - `TranslationBatch`: locale tag mapped to `{ fields, origin? }`, or to `null` to delete that locale's row.
  - `TranslationWriteSlot` and `TranslationWritePlan`: the validated output of `plan`, either an upsert or a delete per locale, plus `fallbackLocale`.
- **`TranslationPort`** is the interface the module supplies:
  - `resolve`: batch lookup over the full locale-candidate chain, with an optional `draftTag`.
  - `removeAll`: removes every locale's row for one entity, optionally inside a session.
  - `search`: returns entity ids whose translated fields match a pre-escaped pattern.
  - `canPreviewDrafts`: whether a caller may read draft-language text.
  - `plan`: validates a batch without writing and needs no entity id.
  - `write`: applies an already-validated plan. It does not touch cache tags or audit trails, but it does write the derived index column.
  - `readAll`: every locale's row for an entity, unresolved.
  - `readServed`: only served languages plus the fallback.
- **`registerTranslationPort(port?)`** sets or clears the module-level port.
- **Safe wrappers** that no-op when no port is registered:
  - `resolveTranslations`: returns an empty map, also for an empty id list.
  - `removeTranslations`: returns 0.
  - `searchTranslatedEntityIds`: returns `[]`.
  - `canPreviewDraftLanguages`: returns `false`.
  - `isTranslationAvailable`: returns whether a port is registered.
- **`previewDraftTag()`** returns the ambient locale when the request-bound locale context has `preview` set, and `undefined` otherwise.
- **`planTranslations`** is the validate half of a write. Unregistered, it falls back to fallback-language-only content. The rest of its body and any further exports are not shown in the excerpt I was given.

## Relationships
- **`@infrastructure/i18n`** (`src/infrastructure/i18n/index.ts`, `context.ts`, `catalog.ts`): the file imports `t`, `getCurrentLocale`, `getFallbackLocale`, `getLocaleContext` and `localeCandidatesFor` from it. `previewDraftTag` reads the locale context. `localeCandidatesFor` stays in i18n because it is pure locale-chain maths.
- **`src/infrastructure/http/response.ts`**: supplies `fieldError`, `generateReject` and the `ResponseReject` type, used for rejections such as the 422 in `planTranslations`.
- **`src/infrastructure/persistence/versioning.ts`**: `carryVersion` is imported.
- **`modules/locales`** (`src/modules/locales/module.ts`, `src/modules/locales/services/translations.ts`): the module that owns languages and registers the port. This follows from the file's own doc comment.
- **`src/kernel/middlewares/locale-preview.ts`**: binds the preview flag that `previewDraftTag` reads. This follows from the doc comment on `previewDraftTag`.
- **Other graph neighbors** (`src/modules/products/services/read.ts` and `lookups.ts`, `src/modules/orders/services/snapshot.ts`, `src/modules/example/services/crud.ts`, `src/app.ts`, `scenarios/products.ts`): I can't confirm from the visible content how they use this file. The doc comments suggest product reads, hard deletes and order snapshots are among the consumers.

## Notes
- Soft deletes must not call `removeAll`. A soft-deleted entity is a restore candidate, and restoring a product with no translated name is the bug the port exists to prevent.
- Only `removeAll` is exposed for removal. A `null` in a PATCH and a language's own delete cascade are handled inside `modules/locales` against its own repository.
- `previewDraftTag` returns nothing for workers or order snapshots run under `runWithLocale`, so draft text can't reach messages that outlive the request.
- `write` never validates, so callers must run `plan` first or risk corrupting data.
- A caller can pass `plan` a batch for an entity that doesn't exist yet, such as `POST /products`, since validation checks only locales and field names.
- With no port registered, the shop is effectively monolingual, but writing fallback-language content still works.
