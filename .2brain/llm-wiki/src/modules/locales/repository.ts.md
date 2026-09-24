---
source: src/modules/locales/repository.ts
sha256: bbf5d01e0cca9e7dfb0d63b0421b03ecb951ae188ee48b7a35fcafa7b5e7232e
generated_at: 2026-09-23T18:50:50.382421+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/repository.ts

## Purpose

Data-access layer for the three locales collections (`locale`, `localeentry`, `translation`). It centralises every read and write so that the single invariant—every entry mutation bumps the locale's `revision` counter—lives in one place and cannot be bypassed by a caller.

## Key elements

- **`EntryInput` / `ImportCounts` / `LocaleCascadeCounts`** — exported interfaces describing write payloads and operation results.
- **`localeBase` / `entryBase` / `translationBase`** — thin wrappers built via `createRepository` that supply Mongoose model + document→domain transforms and (for locales/entries) a `searchable` filter spec.
- **`findByTag(tag)`** — case-insensitive language lookup; the entry point most routes use.
- **`list(scope?)`** — unpaginated, tag-sorted language listing (bypasses `findAll`'s default limit of 10).
- **`countEntriesByLocale()`** — single `$group` aggregate returning a `Map<tag, count>` restricted to `frontendTenantIds()`.
- **`listEntries(locale, tenant)`** — all entries for one `(locale, tenant)` pair, key-sorted.
- **`listEntriesByTenant(tenant)`** — all entries for one tenant across every locale, `(locale, key)` sorted.
- **`listKeys(locale, tenant)`** — projects only `key` for cheap collision checks before writes.
- **`bumpRevision(tag)`** — atomic `$inc` on `revision`; returns the new number.
- **`createEntry` / `saveEntryValue` / `removeEntry`** — single-row write helpers, each followed by exactly one `bumpRevision`.
- **`importEntries(locale, tenant, inputs, { replace })`** — bulk upsert via `bulkWrite` + optional `deleteMany` for removed keys; one revision bump for the whole batch.
- **`deleteLocaleCascade(locale)`** — deletes entries and translations (parallel), then the language row; returns per-collection delete counts.
- **`findEntityTranslations` / `findEntityLocale`** — read single-entity translation rows by `(entityType, entityId[, locale])`.
- **`resolveEntityFields(entityType, entityIds, localeCandidates)`** — one `$in` query fetching all matching rows, then merges per-entity fields in reverse candidate order (most-specific locale wins, field-by-field).

## Relationships

- **`src/modules/locales/model.ts`** — source of the three Mongoose models, document types, and the `apply*Transform` functions used by the base repositories.
- **`src/infrastructure/persistence/create-repository.ts`** — provides `createRepository` and the `Repository` type that `localeBase`, `entryBase`, and `translationBase` are built from.
- **`src/modules/locales/tenants.ts`** — supplies `frontendTenantIds()` to restrict `countEntriesByLocale` to client-visible tenants.
- **`src/modules/locales/services/translations.ts`** — consumes `resolveEntityFields`, `findEntityTranslations`, `findEntityLocale`, and the `translationBase` CRUD.
- **`src/modules/locales/services/entries.ts`** — consumes the entry read/write functions (`listEntries`, `createEntry`, `saveEntryValue`, `removeEntry`, `importEntries`).
- **`src/modules/locales/services/languages.ts`** — consumes `localeBase`, `findByTag`, `list`, `deleteLocaleCascade`.
- **`src/modules/locales/services/keys.ts`** — consumes `listKeys` for collision detection before writes.
- **`src/modules/locales/services/capabilities.ts`** / **`messages.ts`** — additional service consumers of the repository surface.
- **`src/modules/locales/module.ts`** — wires the repository functions into the service constructors and the module's public API.
- **`src/modules/locales/tests/integration/repository.test.ts`** — integration tests exercising the full query paths against a real database.
- **`src/modules/locales/tests/integration/model.test.ts`** / **`translations.test.ts`** — integration tests for model transforms and translation resolution that pass through this repository.
- **`src/modules/locales/tests/unit/translations.test.ts`** — unit tests for `resolveEntityFields` merge logic.
- **`scenarios/locales.ts`** — end-to-end scenario definitions that drive the locales module (and therefore this repository) through API-level flows.

## Notes

- **Revision bump is not atomic with the row write.** The two writes are ordered (row first, counter second). A crash between them means a client under-fetches once on next poll; it never caches a stale dictionary as current. This is an accepted trade-off documented in the module header.
- **`list` deliberately bypasses `findAll`'s default limit of 10** to avoid silently truncating the language manifest.
- **`importEntries` uses a single `bulkWrite` + one `deleteMany`** rather than a loop of upserts, sized for real import volumes (~500 keys).
- **`resolveEntityFields` merges in _reverse_ candidate order** so the most-specific locale overwrites less-specific ones field-by-field (a locale may have translated only a subset of fields).
- **`deleteLocaleCascade` runs the two child deletions in parallel (`Promise.all`)** before removing the parent row, so an interruption leaves the language present with empty children rather than orphaned children with no language.
- **`entryBase` searchable spec** exposes one combined `text` filter over both `key` and `value`, intentionally so translators and developers share a single search box without guessing which column to target.
