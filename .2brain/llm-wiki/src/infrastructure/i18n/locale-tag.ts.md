---
source: src/infrastructure/i18n/locale-tag.ts
source_sha256: 20175a1c57b257071a74aeb432dbadb92bfd2b4263bf31dbf13905a0722ab2c5
context_sha256: 6b13911c824ab46484129d1507d4f2e64eb3f4ed22b2cf4e988e20ec785918b5
generated_at: 2026-11-22T02:56:11.855205+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/i18n/locale-tag.ts

## Purpose
Defines the single notion of "the same language tag" for the API. BCP 47 tags compare case-blind, and the canonical spelling (`pt-BR`, `zh-Hant-TW`) is what the API stores, returns, and uses to name dictionary files. The file is pure `Intl` with no imports, because `src/infrastructure/config/fields.ts` also reads it and that file sits near jest's global-setup import chain.

## Key elements
- `parseCanonical` (private): wraps `Intl.getCanonicalLocales(tag).at(0)` in a try/catch. It returns the canonical tag, or `undefined` when the tag is malformed (e.g. `en-a`, `en_US`) or empty. The try/catch is the only place the `RangeError` is handled.
- `isWellFormedLocale(tag)`: true when the tag parses, in any casing. The 422 on a written tag is built from this check.
- `canonicalLocale(tag)`: returns the canonical spelling (`pt-br` -> `pt-BR`, `iw` -> `he`). Never throws. An unparseable tag is returned unchanged, so validation can refuse it later instead of the setter.
- `baseLanguage(tag)`: returns the lower-case primary language subtag (`pt-BR` -> `pt`, `fil` -> `fil`). For an unparseable tag it returns the text before the first hyphen, lower-cased.
- `canonicalLocaleSetter(value)`: the `set:` function for a Mongoose column that stores a tag. Strings are trimmed and canonicalised. Non-strings are returned untouched so Mongoose's own cast reports them. Never throws.

## Relationships
The graph lists many neighbors, but the file itself shows only one dependency. It has no imports and states that `src/infrastructure/config/fields.ts` reads it. The doc comments mention a Mongoose setter and a 422 on written tags, which fits the locale, user, and order models and the HTTP schemas in the graph. The file itself does not name those consumers. `tests/unit/infrastructure/i18n/locale-tag.test.ts` is its unit test.

## Notes
- Invalid input is never thrown from here. Setters and `canonicalLocale` pass bad tags through, and `isWellFormedLocale` is the one place that decides well-formedness.
- Canonicalisation also rewrites deprecated subtags (`iw` -> `he`), not just casing.
- Keep the file import-free to avoid pulling dependencies into the config and jest setup chain.
