# src/infrastructure/i18n/negotiate.ts

## Purpose

Pure function for `Accept-Language` header negotiation: given a client-supplied language string and the API's supported locale list, returns the best-match locale. It has no I/O or ambient state (no request object, no module-level config) so it can be called from the HTTP middleware or directly in tests with an arbitrary supported list.

## Key elements

- **`negotiateLocale(acceptLanguage?, supported?)`** — The sole export. Accepts an optional `Accept-Language` header string and an optional `string[]` of supported locales (defaults to `listSupportedLocales()`). Parses comma-separated tags with `;q=` parameters, sorts by quality (stable for equal weights), then matches in order: wildcard `*` → exact tag → base-language tag (e.g. `en-GB` → `en`). Returns the fallback locale if nothing matches. Never throws on malformed input.
- **Fallback resolution** — Uses `getFallbackLocale()` if it appears in the supported list; otherwise falls back to the first entry of the provided list.

## Relationships

- **`src/infrastructure/i18n/catalog.ts`** — Source of `getFallbackLocale()` and `listSupportedLocales()`; the only runtime dependency.
- **`src/infrastructure/http/middlewares/locale.ts`** — Primary consumer; calls `negotiateLocale` per request to resolve the response locale.
- **`src/infrastructure/i18n/index.ts`** — Barrel module that re-exports this file alongside the rest of the i18n infrastructure.
- **`tests/unit/infrastructure/i18n/negotiate.test.ts`** — Unit tests exercising the negotiation logic with synthetic supported lists.

## Notes

- `q=0` is parsed as an explicit refusal (tag is filtered out); an unparseable `q=` value (e.g. `q=abc`) defaults to `1` rather than being treated as zero.
- Matching is case-insensitive via a `Map` of lowercased supported locales, but the *original* casing from the supported list is returned.
- The function relies on `Array.prototype.toSorted` (ES2023), so the runtime/target must support it.
- The `supported` parameter exists so tests and callers can inject a custom list without mutating the catalogue.
