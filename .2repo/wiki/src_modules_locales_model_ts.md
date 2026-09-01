# src/modules/locales/model.ts

## Purpose

Defines the two Mongoose schemas, indexes, and model exports for the locale OVERRIDE tier: the **languages** collection (registered BCP 47 tags) and the **entries** collection (one row per language/tenant/key translation). This tier is read exclusively through a boot-time overlay rebuilt by `@infrastructure/i18n`; a Mongo outage degrades to a stale overlay, never a failed `t()` call.

## Key elements

- **`deriveBaseLanguage(tag)`** — extracts and lowercases the ISO 639-1 subtag (`pt-BR` → `pt`). Used by the schema hook and by seeds/migrations that bypass Mongoose setters.
- **`LocaleDocument` / `LocaleMessageDocument`** — Mongoose `Document` interfaces that omit the domain `id`/timestamps and add optional `createdAt`/`updatedAt`.
- **`localeSchema`** — languages collection. Fields: `tag` (unique, lowercased), `baseLanguage` (derived), `name`, `nativeName`, `direction` (LTR/RTL enum, default LTR), `active` (public visibility flag), `revision` (bumped by the repository on any entry write).
- **`localeSchema.pre('validate')`** — auto-sets `baseLanguage` from `tag` on every save, so no write path can drift the two.
- **`localeMessageSchema`** — entries collection. Fields: `locale` (tag string, not ObjectId), `tenant` (plain string; service rejects unknown tenants), `key` (flat or dotted, stored as a single string), `value` (defaults to `''`; empty is a valid un-translated row).
- **`localeMessages_locale_tenant_key`** — unique compound index `{locale, tenant, key}`. Serves both the per-tenant download read and the admin `locale`-only listing as a prefix.
- **`applyLocaleTransform` / `applyLocaleMessageTransform`** — wrappers around `applySerialization` that map `_id`→`id` and strip `__v`.
- **`localeModel` / `localeMessageModel`** — the two `mongoose.model()` exports consumed by the repository and services.

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** — provides `applySerialization`, the single helper both transform functions delegate to.
- **`src/types/index.ts`** — source of the `LocaleDirection` enum and the `Language` / `LocaleEntry` domain types that the document interfaces extend.
- **`src/modules/locales/repository.ts`** — the only writer that bumps `revision` and performs the cascade-delete of entries when a language is removed; the schema's `revision` comment points here.
- **`src/modules/locales/services/languages.ts`**, **`…/entries.ts`**, **`…/capabilities.ts`** — service layers that read/write through the models and enforce tenant/entry invariants before a row touches Mongo.
- **`src/modules/locales/demo.ts`**, **`…/fixtures.ts`** — seed and fixture data written directly against the models (bypassing service-layer validation, relying on the schema's `lowercase`/`trim` options and the `pre('validate')` hook).
- **`src/modules/locales/tests/unit/schema-contract.test.ts`**, **`…/service.test.ts`**, **`…/integration/repository.test.ts`** — unit and integration coverage for schema defaults, index uniqueness, and repository-level revision/cascade behavior.

## Notes

- **Collection name on disk is `localemessages`** (Mongoose lowercases + pluralises `LocaleMessage`). Migrations and any direct Mongo queries must use that spelling.
- **Index names are hard-coded** to match the corresponding migration files (`locales_tag`, `localeMessages_locale_tenant_key`). A rename here without updating the migration will cause a duplicate-index conflict at boot.
- **`locale` in the entries schema is the tag string, not an ObjectId.** There is no foreign-key join; referential integrity is enforced by the repository's cascade delete.
- **`tenant` is part of the row's identity** (in the unique index), not merely a label. Two tenants can legitimately own the same `key`.
- **`value` defaults to `''`** rather than being `required: true`, because Mongoose's `required` on a String rejects the empty string, and an empty translation (key imported but not yet filled) is a valid row.
- **`baseLanguage` is derived in `pre('validate')`, not `pre('save')`**, because Mongoose checks `required: true` at validation time; a `pre('save')` hook would run after the check and the field would appear missing.
