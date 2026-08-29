# src/modules/locales/tests/integration/model.test.ts

## Purpose

Integration tests that pin the **schema-level** guarantees for the locale and locale-message models: serialization (no `_id`/`__v` on either the `toJSON` or `.lean()` path), default values, tag normalization, and the derived `baseLanguage` field. They target the schema hooks and defaults directly rather than a single service, because seeds and migrations write documents through paths that bypass the service layer.

## Key elements

- **`describe('language serialization')`** — three tests:
  - `toJSON` strips `_id`/`__v` and exposes a flat `id` string.
  - Schema defaults populate `direction` (`LocaleDirection.ltr`), `active` (`true`), and `revision` (`0`) when the caller omits them.
  - `tag` is lowercased (and trimmed) on write so a single language cannot produce duplicate rows.
- **`describe('entry serialization')`** — two tests:
  - The `.lean()` list path (via `localeService.searchEntries`) returns items with no `_id`/`__v`, asserting the exported transform handles the lean shape.
  - An omitted `value` on a locale-message defaults to `''`, which `required: true` on a String schema would otherwise reject.
- **`describe('baseLanguage')`** — parameterized + override tests:
  - Derives the ISO 639-1 prefix from tags like `es`, `pt-BR`, `zh-Hant`, `zh-Hant-HK` via a schema hook.
  - Overwrites a caller-supplied `baseLanguage` that contradicts the tag, guaranteeing the column and tag never disagree.

## Relationships

- **`src/modules/locales/factory.ts`** — provides `makeLocale`, used to build valid locale fixtures for the `baseLanguage` tests.
- **`src/modules/locales/repository.ts`** — source of `localeRepository` and `localeMessageRepository`; all document creation goes through these to exercise schema hooks and defaults.
- **`src/modules/locales/services/index.ts`** — source of `localeService`; the `searchEntries` call exercises the lean-list serialization path.
- **`src/types/index.ts`** — provides the `LocaleDirection` enum referenced in the defaults assertion.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` boots an in-memory Mongo instance before the suite runs.
- **`tests/support/stub.ts`** — `asStub<T>()` casts an opaque service result into a record so the test can assert on individual keys without duplicating the type.

## Notes

- Tests deliberately assert schema behavior (hooks, defaults) rather than service logic because "derived" must hold for **every** write path, including seeds and migrations that call Mongoose directly.
- The `.lean()` test exists specifically because `.lean()` bypasses `toJSON` entirely; the transform in the service layer is the only safeguard on that path.
- The file's header comment notes that 95 schemas in `openapi.yaml` declare `additionalProperties: false`, so a leaked `_id` is a contract violation caught by `tests/contract/`.
- `db/demo/demo-data.json` is generated from what the schema actually produces; these default assertions protect the integrity of that file, which feeds frontend mocks.
- The `asStub` cast is a deliberate workaround for the service's opaque return type—do not remove it to "fix" a type error; the underlying service type intentionally hides Mongoose internals.
