---
source: src/modules/locales/model.ts
sha256: bbfede122e2789b885c674b196e42d756aca8e825fc7476e28d9ccdb6fb8005b
generated_at: 2026-09-23T18:50:02.947662+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/model.ts

## Purpose

Defines the three Mongoose schemas and models behind the **OVERRIDE tier** of i18n: registered languages, per-tenant dictionary entries, and per-entity translated fields. These collections hold the runtime-editable rows that `@infrastructure/i18n` reads (at boot, on a timer, and after a write) to build its in-memory overlay. Nothing in this file is ever awaited on the request path; a Mongo outage or malformed key degrades the overlay to stale, never blocks a request.

## Key elements

- **`deriveBaseLanguage(tag)`** — extracts the ISO 639-1 subtag from a BCP 47 tag (`pt-BR` → `pt`). Also lowercases, because seeds call it directly (bypassing the Mongoose setter).
- **`LocaleDocument` / `LocaleEntryDocument` / `TranslationDocument`** — Mongoose document interfaces, each `Omit`ting the generated `id`/`createdAt`/`updatedAt` from the `@types` contracts and re-adding the Mongoose `Document` shape.
- **`LocaleModel` / `LocaleEntryModel` / `TranslationModel`** — type aliases for the Mongoose `Model<T>` generics.
- **`localeSchema`** — languages collection. Notable: `tag` is lowercased by the schema (BCP 47 is case-insensitive, Mongo is not); `baseLanguage` is a derived column maintained by a `pre('validate')` hook; `active` is a single boolean (no separate "draft" vs "hidden"); `revision` is bumped by the repository on any entry write.
- **`localeEntrySchema`** — one row per `(locale, tenant, key)`. `value` uses `default: ''` rather than `required: true` so an un-translated key is a valid row. Compound unique index `{ locale, tenant, key }` serves both per-tenant and per-language queries.
- **`translationSchema`** — one row per `(entityType, entityId, locale)`. `fields` is `Schema.Types.Mixed` (shape is registry-defined, validated at service layer). `sourceDigest` is absent on the fallback-locale row. Compound unique index `{ entityType, entityId, locale }` with `entityId` in the middle to serve per-entity lookups.
- **`applyLocaleTransform` / `applyLocaleEntryTransform` / `applyTranslationTransform`** — serialization normalizers (`_id` → `id`, strip `__v`) built via `applySerialization`.
- **`localeModel` / `localeEntryModel` / `translationModel`** — Mongoose model entrypoints. Collection names on disk: `locales`, `localeentries`, `translations`.

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** — provides `applySerialization`, which this file calls to build the three `apply*Transform` normalizers.
- **`src/types/index.ts`** — source of the domain types (`Language`, `LocaleEntry`, `Translation`, `LocaleDirection`, `TranslationOrigin`) that the schemas and document interfaces are built against.
- **`src/modules/locales/repository.ts`** — primary consumer of the three models; performs all CRUD, revision bumps, and cascade deletes.
- **`src/modules/locales/factories.ts`** — wires the models into repository and service instances.
- **`src/modules/locales/index.ts`** — barrel re-export for the module.
- **`src/modules/locales/services/*.ts`** (capabilities, entries, languages, translations) — consume the models indirectly through the repository; validate `tenant` and `fields` before writes (the schema itself does not enforce those).
- **`src/modules/locales/tests/unit/schema-contract.test.ts`** — asserts schema field types, defaults, and index definitions.
- **`src/modules/locales/tests/unit/service.test.ts`** — exercises service logic against the models.
- **`src/modules/locales/tests/integration/repository.test.ts`** — integration tests hitting the real collections.
- **`tests/integration/app/demo-restore.test.ts`** — end-to-end restore scenario that exercises the full locales stack.

## Notes

- **`baseLanguage` is always derived, never supplied.** The `pre('validate')` hook sets it from `tag` on every write path (including seeds and one-off scripts). If you add a new write path, the hook covers it; a manual assignment would not.
- **`tag` lowercasing is a schema-level guarantee, not a service-level one.** The unique index `{ tag: 1 }` is what makes `pt-BR` and `pt-br` impossible as two rows. Do not remove the `lowercase: true` option without an equivalent migration.
- **`value` on entries is `default: ''`, not `required: true`.** Mongoose `required` on a String rejects `''`. An empty value is a legitimate "key exists, not yet translated" state.
- **`fields` on translations is intentionally `Mixed`.** The valid key set depends on a per-`entityType` registry (`translatables`) that the schema cannot see. Validation lives in the service layer.
- **Index ordering is deliberate.** In both compound unique indexes the "middle" key (`tenant` in entries, `entityId` in translations) is placed so the index prefix serves the hottest query without a scan. Do not reorder without re-checking the query patterns in `repository.ts`.
- **This file is read-only on the request path.** The overlay `@infrastructure/i18n` materializes translations from these rows at boot / on timer / after write. A `t()` call never hits Mongo directly.
