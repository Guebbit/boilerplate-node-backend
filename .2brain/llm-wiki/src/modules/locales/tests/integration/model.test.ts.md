---
source: src/modules/locales/tests/integration/model.test.ts
sha256: 85095a89f993fb220065976bd3f3ae08a564d3c4b1c6cd9c1d0a410ceda67ee0
generated_at: 2026-11-14T20:23:58.173497+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/integration/model.test.ts

## Purpose

Integration tests that pin the serialization contract of the `locale` and `localeEntry` models on both response paths (hydrated `toJSON` and lean list), verify schema-level defaults and hooks, and guard against `_id`/`__v` leaking into API responses. They exist because 95 schemas in `openapi.yaml` declare `additionalProperties: false`, so any stray field is a contract violation, and the lean path bypasses `toJSON` entirely.

## Key elements

- **`describe('language serialization')`** — Three tests against the locale repository's create path: (1) `toJSON` maps `_id` → `id` and strips `__v`; (2) schema defaults fill `direction`, `active`, `revision` when omitted; (3) tag is canonicalised on write (`'  PT-BR '` → `'pt-BR'`).
- **`describe('entry serialization')`** — Two tests: (1) the search service returns a lean list where `id` is a 24-hex string and `_id`/`__v` are absent (asserted via `toBeUndefined`); (2) omitting `value` yields `''` (empty string), satisfying the wire-level `required: true`.
- **`describe('baseLanguage')`** — Parametrised (`it.each`) over bare, regional, script, and combined tags to confirm the schema hook derives the ISO 639-1 prefix; plus one test proving the hook overwrites a caller-supplied `baseLanguage` that contradicts the tag.
- **`setupTestDb()`** — Called at module top level to spin up a real in-memory Mongo instance.
- **`asStub<T>()`** — Type-cast helper (from `tests/support/stub.ts`) used to index into `result.data?.items[0]` without narrowing the generic service return.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/locales/repository.ts` | The test imports `localeRepository` and `localeEntryRepository` from this module and calls their `create` methods as the write entry points in every test. |
| `src/modules/locales/services/index.ts` | The test imports `localeService` from this module and calls `searchEntries` to exercise the lean-list read path (the path that bypasses `toJSON`). |
| `src/modules/locales/factories.ts` | The test imports `makeLocale` from this module to build the input object for the `baseLanguage` parametrised tests. |
| `src/types/index.ts` | The test imports `LocaleDirection` from this module and asserts its `ltr` member as the expected schema default. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises the shared in-memory MongoDB connection. |
| `tests/support/stub.ts` | `asStub<Record<string, unknown>>(…)` safely casts the first search-result item for property-level assertions. |

## Notes

- **Two-path serialization is intentional.** The file's module doc comment explains that asserting per model (rather than trusting a shared `applySerialization` helper) is deliberate because the lean path and the `toJSON` path are structurally different.
- **`baseLanguage` is a schema hook, not service logic.** The "overrides whatever a caller supplied" test exists to lock in that guarantee: any code path (seeds, scripts) that forgets to set it still gets the correct value, and a wrong value is silently corrected.
- **Empty-string `value` is a design decision.** The entry test documents that an untranslated row is a valid state, and the schema default of `''` keeps the field present on the wire to satisfy `required: true`.
- **Tag canonicalisation** (`trim` + normalise) is asserted at the repository level, meaning it is a schema/Pre-validate hook concern, not a service-layer concern.
