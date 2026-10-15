---
source: src/modules/locales/factories.ts
sha256: 6d390cd4dcd5ed1b462687ccd3610c25973524fe42569702dfa09a3c9f17822a
generated_at: 2026-10-15T10:43:20.620673+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/factories.ts

## Purpose

Builds in-memory fixtures (ready-made documents) for the two locale collections—**Language** and **LocaleEntry**—used in tests and seeding. It exists so that test code never hand-rolls raw document objects; instead it calls a factory that fills identity fields, derives schema-linked values (e.g. `baseLanguage`), and strips undefined keys, producing a record that matches what the API itself would produce.

## Key elements

- **`LocaleOverrides`** / **`LocaleEntryOverrides`** — input types for the factories; extend `OverridesFor<T>` (from persistence factories) with the collection's required addressing fields (`tag` or `locale`+`key`).
- **`LocaleFixture`** / **`LocaleEntryFixture`** — output types: a `Partial<Document>` pinned to a required `_id` (plus `tag` or `locale`/`key`). These are what `localeRepository.create` / `localeEntryRepository.create` expect.
- **`makeLocale`** — builds a `LocaleFixture`. Sets `name` and `nativeName` from `tag`, calls `deriveBaseLanguage(tag)` (same derivation the production `createLanguage` uses), spreads `identityOf` for `_id`/timestamps, and strips undefined fields.
- **`makeLocaleEntry`** — builds a `LocaleEntryFixture`. Spreads `identityOf` for `_id`/timestamps, then strips undefined from the caller-supplied fields.

## Relationships

- **`src/infrastructure/persistence/factories.ts`** — source of `identityOf` (generates `_id`, `createdAt`, `updatedAt`) and the `OverridesFor<T>` generic type that both override types extend.
- **`src/infrastructure/object-guards.ts`** — provides `stripUndefined`, used by both factories to drop keys whose value is `undefined` before the spread reaches the final object.
- **`src/modules/locales/model.ts`** — source of `deriveBaseLanguage` (replicates production derivation logic) and the `LocaleDocument` / `LocaleEntryDocument` types that the fixture types intersect with.
- **`src/types/index.ts`** — source of the `Language` and `LocaleEntry` domain types that parameterize `OverridesFor`.
- **Test files** (`tests/integration/*`, `src/modules/locales/tests/*`, `tests/contract/*`, `scenarios/locales.ts`) — consume `makeLocale` / `makeLocaleEntry` to seed locale and entry documents before exercising repositories, ACLs, or contract assertions.

## Notes

- The factory deliberately does **not** let the caller override `baseLanguage`; it is always derived from `tag` to prevent a fixture from encoding a value the production API could never emit.
- `_id` is required (not optional) in both fixture types because `insertIfAbsent` / `upsertById` key idempotency on the `_id`, not on other fields.
- `tag` is lowercased by the schema on write; fixtures may pass it in either case.
- Fields the caller omits (and that aren't set by the factory) fall through to the schema's `default:` values—so a seeded record reflects the schema, not a factory's guess.
