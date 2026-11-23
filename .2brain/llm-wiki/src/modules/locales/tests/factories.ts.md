---
source: src/modules/locales/tests/factories.ts
generated_at: 2026-11-22T05:49:34.670848+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/tests/factories.ts

## Purpose
Test-database locale factories. The builder (`makeLocale`) lives one level up in `src/modules/locales/factories.ts`; this file only persists what it returns through the locale repository, so tests can get a stored locale in one call.

## Key elements
- `givenLocale(tag, overrides?)`: persists a locale for a BCP-47 tag and returns `Promise<LocaleDocument>`. It sets `name` and `nativeName` to the tag itself. `overrides` accepts `{ active?: boolean }`, for example to create a locale that exists but is disabled.

## Relationships
- `src/modules/locales/factories.ts`: supplies `makeLocale`, which builds the locale data passed to the repository.
- `src/modules/locales/repository.ts`: `localeRepository.create` does the actual persistence.
- `src/modules/locales/model.ts`: provides the `LocaleDocument` type for the return value.
- The integration and contract tests listed as neighbors (for example `manifest-visibility`, `translations`, `language-negotiation`, `draft-language-*`) are the consumers. They use it to seed locales.

## Notes
- Use it when the display name is not under test. `name` and `nativeName` are always equal to the tag.
- `overrides` is spread last, but its type only allows `active`. Other fields need `makeLocale` and the repository directly.
