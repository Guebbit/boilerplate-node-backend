# src/infrastructure/i18n/negotiate.ts

## Purpose

Implements `Accept-Language` header negotiation: given a client-supplied header string and a list of supported locales, it returns the single best-matching locale. It is a pure function (no request object, no ambient state) so both the HTTP middleware and tests can call it with arbitrary inputs.

## Key elements

- **`negotiateLocale(acceptLanguage?: string, supported?: string[]): string`** — The sole export. Parses the header, honours q-weights, matches region tags to their base language (`en-GB` → `en`), treats `*` as "return the default", and falls back to `NODE_FALLBACK_LOCALE` (or the first supported locale) when nothing matches. Never throws on malformed input.

## Relationships

- **`src/infrastructure/i18n/catalog.ts`** — Source of `getFallbackLocale()` and `listSupportedLocales()`, used as the default `supported` argument and the fallback value.
- **`src/infrastructure/http/middlewares/locale.ts`** — Consumes `negotiateLocale` to resolve the request's locale before handing the request to handlers.
- **`src/infrastructure/i18n/index.ts`** — Barrel file that re-exports this module's public API.
- **`tests/unit/infrastructure/i18n/negotiate.test.ts`** — Unit tests that call `negotiateLocale` with crafted headers and supported lists.

## Notes

- **Stable sort via `.toSorted`** — Candidates with equal q-weights retain their original header order, preserving the client's stated preference.
- **Unparseable q-value ≠ `q=0`** — A missing or non-numeric `q` defaults to 1 (the client still named a language); `q=0` is an explicit refusal and is filtered out.
- **Fallback resolution** — If `getFallbackLocale()` is not in the `supported` list, the first entry of `supported` is used instead. This means the fallback is *always* a member of the provided list (or the global default as a last resort).
- **`supported` is case-insensitive** — A lowercase map is built for lookups, but the original casing from the supported list is returned.
