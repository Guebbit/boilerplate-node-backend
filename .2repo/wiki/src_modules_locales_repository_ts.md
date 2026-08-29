# src/modules/locales/repository.ts

## Purpose

Data-access layer for the locales module. It owns all MongoDB reads and writes against the `locales` and `localemessages` collections, and — critically — couples every entry-level write to an atomic `revision` bump so that no caller can mutate translations without invalidating client caches.

## Key elements

- **`EntryInput`** / **`ImportCounts`** — narrow input/output shapes for single-entry and bulk operations.
- **`localeBase`** / **`entryBase`** — instances from `createBaseRepository`, preconfigured with document transforms and searchable-field maps (exact, boolean, text).
- **`findByTag(tag)`** — case-insensitive single-locale lookup; the starting point for most service routes.
- **`publicScope()`** — returns `{ active: true }` for client-facing manifest reads; admins pass `undefined` to list all.
- **`list(scope?)`** — unpaginated, tag-sorted language list via a direct model query (bypasses `findAll` to avoid its default 10-row limit).
- **`countEntriesByLocale()`** — single aggregation returning a `Map<locale, count>` of downloadable entries, filtered to frontend tenants only.
- **`listEntries(locale, tenant)`** / **`listEntriesByTenant(tenant)`** — full entry sets sorted for byte-stable builds / diffable overlays.
- **`listKeys(locale, tenant)`** — key-only projection used by the collision check on every write.
- **`bumpRevision(tag)`** — atomic `$inc` on `revision`; returns the new value.
- **`createEntry` / `saveEntryValue` / `removeEntry`** — single-entry CRUD, each returning `{ entry, revision }` with the bump baked in.
- **`importEntries(locale, tenant, inputs, { replace })`** — bulk upsert via `bulkWrite`; when `replace` is true, deletes keys absent from the input. Bumps revision once per batch.
- **`deleteLocaleCascade(locale)`** — deletes all entries for the tag, then the locale row; returns the entry count removed.
- **`localeRepository`** — exported `BaseRepository<LocaleDocument>` extended with the language-specific helpers above.
- **`localeMessageRepository`** — exported `BaseRepository<LocaleMessageDocument>` extended with the entry-specific helpers (content truncated in source).

## Relationships

- **`src/infrastructure/persistence/base-repository.ts`** — provides `createBaseRepository` and the `BaseRepository` type; this file spreads those base instances into the two exported repositories.
- **`src/modules/locales/model.ts`** — supplies the Mongoose schemas (`localeModel`, `localeMessageModel`), their transforms, and the `LocaleDocument` / `LocaleMessageDocument` types used throughout.
- **`src/modules/locales/tenants.ts`** — `frontendTenantIds()` gates which tenant rows `countEntriesByLocale` includes.
- **`src/types/index.ts`** — source of the `LocaleTenant` type used in every entry-level signature.
- **`src/modules/locales/services/*` (capabilities, entries, keys, languages, messages)** — primary consumers; they call the exported repositories and never touch the models directly.
- **`src/modules/locales/tests/integration/repository.test.ts`** — integration tests exercising this file's public surface.
- **`src/modules/locales/tests/integration/model.test.ts`** — tests the transform/model layer this file depends on.

## Notes

- **Revision is not optional.** Every entry write path (`createEntry`, `saveEntryValue`, `removeEntry`, `importEntries`) calls `bumpRevision` in the same function. There is no API surface that mutates `localemessages` without also incrementing `revision`.
- **Crash-ordering is deliberate.** Writes go rows-then-counter; a crash between them leaves entries *newer* than the revision claims, so a client under-fetches for one cycle (harmless). The reverse order would let clients cache a stale dictionary indefinitely. `deleteLocaleCascade` inverts this: entries first, locale second, so an interruption leaves a briefly-empty language rather than orphan rows.
- **`list` bypasses the base repository.** `findAll` defaults to a 10-document limit; a silently truncated manifest is the exact failure mode this avoids.
- **`countEntriesByLocale` is frontend-tenant-only.** Backend-override rows are excluded because the manifest's `entryCount` drives client download decisions; counting server-only keys would advertise a language as having downloadable content it doesn't.
- **Explicit export types.** The two repository exports spell out their method signatures rather than relying on inference; Mongoose `Query` generics trigger TS7056 at export boundaries when spread from a base repository.
- **`replace` is a repository flag, not an HTTP verb.** Both import callers share one code path; the flag is read side-by-side in `importEntries` rather than exposed as two separate endpoints.
