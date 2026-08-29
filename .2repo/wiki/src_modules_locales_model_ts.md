# src/modules/locales/model.ts

## Purpose

Defines the Mongoose schemas, model instances, document types, and serialization transforms for the two Mongo collections backing the OVERRIDE tier of i18n: registered languages and their per-tenant translated string entries. Every persistence-level rule (uniqueness, derived fields, index shape) is declared here so that all write and read paths share a single source of truth.

## Key elements

- **`deriveBaseLanguage(tag)`** – Extracts and lowercases the ISO 639-1 subtag from a BCP 47 tag (e.g. `pt-BR` → `pt`). Used by the schema hook; also called directly by seeds and migrations.
- **`LocaleDocument` / `LocaleMessageDocument`** – Mongoose document interfaces that override the generated `Language` / `LocaleEntry` date fields to match Mongoose's `timestamps` behavior.
- **`localeSchema`** – Language schema: `tag`, `baseLanguage` (derived), `name`, `nativeName`, `direction`, `active`, `revision`. A `pre('validate')` hook auto-derives `baseLanguage` from `tag` on every save. Unique index on `tag`.
- **`localeMessageSchema`** – Entry schema: `locale` (string tag, not ObjectId), `tenant`, `key` (flat dotted string), `value` (defaults to `''`). Unique compound index on `{ locale, tenant, key }` with that specific key order to serve both whole-dictionary reads and per-language admin listings.
- **`applyLocaleTransform` / `applyLocaleMessageTransform`** – Serialization normalizers (map `_id` → `id`, strip `__v`) built via `applySerialization`.
- **`localeModel` / `localeMessageModel`** – The two Mongoose model singletons (`Locale` / `LocaleMessage`). The latter resolves to the `localemessages` collection on disk.

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** — Exports `applySerialization`, which this file calls to produce the two transform functions.
- **`src/types/index.ts`** — Supplies the `LocaleDirection` enum and the `Language` / `LocaleEntry` interfaces that the document types extend.
- **`src/modules/locales/repository.ts`** — Consumes `localeModel` / `localeMessageModel` for all CRUD; the `revision` bump on write lives in that file, not here.
- **`src/modules/locales/services/languages.ts` / `entries.ts` / `capabilities.ts`** — Query the models (e.g. `active` filter, whole-dictionary reads by `locale` + `tenant`).
- **`src/modules/locales/demo.ts`** — Seeds sample documents through the models.
- **`src/modules/locales/tests/integration/repository.test.ts`** and **`tests/unit/service.test.ts`** — Exercise the schemas and models directly.

## Notes

- **Nothing in this file is awaited on the hot request path.** `negotiateLocale` and `t()` never read a row; the overlay is rebuilt at boot / on a timer / after a write. The worst case of Mongo being down is two admin endpoints failing, never a locale resolution failure.
- **`pre('validate')`, not `pre('save')`.** `required: true` is enforced during validation; a `save` hook would run after the error it exists to prevent.
- **`value` uses `default: ''` rather than `required: true`.** An empty translation is a legitimate row (imported but untranslated); `required` on a String rejects the empty string.
- **Index names are explicit** (`locales_tag`, `localeMessages_locale_tenant_key`) to match the names created by the corresponding migrations. A derived name would cause an index-options conflict at boot on every migrated database.
- **`tenant` is a plain string, not an enum.** The set of valid tenants is runtime configuration; the service rejects unknown tenants with 422 before a row is written. An enum would create a boot-order dependency.
- **`key` is a flat dotted string**, not a nested path. The alternative (nested `messages` object) turns a single-word edit into a multi-level `$set` and introduces dot-escaping pitfalls.
