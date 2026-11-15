---
source: src/infrastructure/i18n/locale-tag.ts
sha256: 3c903cf18960ccde5132dc1e056c4abe86a3faa03e69cf1f3ded606f949fe576
generated_at: 2026-11-14T18:08:46.968294+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/i18n/locale-tag.ts

## Purpose

Single, import-free definition of BCP 47 language-tag identity for the codebase. It normalises casing and deprecated subtags via `Intl.getCanonicalLocales`, exposes a few small helpers for validation, display, and Mongoose column wiring, and is deliberately kept as a zero-import module so it can sit safely in jest's global-setup import chain (where `infrastructure/config/fields.ts` pulls it in).

## Key elements

- **`parseCanonical`** *(private)* – Wraps `Intl.getCanonicalLocales` in a try/catch; returns the canonical tag string or `undefined` for malformed input. The `RangeError` from `Intl` is the "not a tag" signal.
- **`isWellFormedLocale(tag)`** – Boolean check: whether the tag is well-formed BCP 47 (any casing). Used as the 422 gate for written tags.
- **`canonicalLocale(tag)`** – Returns the canonical spelling (e.g. `pt-br` → `pt-BR`, `iw` → `he`). **Never throws**; unparseable input is returned unchanged so the setter can store it and downstream validation rejects it.
- **`baseLanguage(tag)`** – Primary subtag, lower-cased (`pt-BR` → `pt`). Falls back to splitting on the first hyphen when the tag is unparseable.
- **`canonicalLocaleSetter(value)`** – Mongoose `SchemaType.set` callback: trims and canonicalises a string; passes non-strings through untouched so Mongoose's own cast error fires.

## Relationships

- **`src/infrastructure/config/fields.ts`** – Imports this module; the zero-import constraint exists specifically to keep this file safe in that file's import chain (near jest global-setup).
- **`src/infrastructure/http/schemas.ts`** – Uses `isWellFormedLocale` as the well-formedness predicate for request-body / query validation (the "422 on a written tag" mentioned in the JSDoc).
- **`src/infrastructure/i18n/catalog.ts`** / **`served.ts`** – The canonical spelling returned here is the name the i18n layer uses to address and serve dictionary files.
- **`src/infrastructure/i18n/index.ts`** – Barrel re-export surface for the i18n infrastructure package.
- **`src/modules/locales/model.ts`**, **`src/modules/users/model.ts`**, **`src/modules/orders/model.ts`** – Mongoose schemas that attach `canonicalLocaleSetter` to locale-tag columns.
- **`src/modules/locales/services/capabilities.ts`**, **`translations.ts`** – Domain services that call `isWellFormedLocale` / `canonicalLocale` / `baseLanguage` when reading or resolving a user's or order's locale.
- **`src/modules/locales/repository.ts`** – Persists and queries by the canonical tag produced by this module.
- **`tests/unit/infrastructure/i18n/locale-tag.test.ts`** – Unit tests covering all four exports plus the private fallback paths.

## Notes

- **Zero imports by design.** The module must remain dependency-free; adding an import could break the jest global-setup chain that `fields.ts` depends on.
- **`canonicalLocale` is intentionally non-throwing.** A malformed tag round-trips unchanged; the *setter* stores it and a *validator* (schema layer) is responsible for the 422. Do not add a throw here.
- **`parseCanonical` is not exported.** All public helpers funnel through it; treat it as an implementation detail that can change without breaking consumers.
- **`baseLanguage` fallback path.** When `Intl` rejects the tag, it splits on the first `-` and lowercases—this is a best-effort heuristic, not a guarantee of a valid subtag.
- **ESLint `no-restricted-syntax` is disabled on the try/catch block** because `Intl.getCanonicalLocales` is the only parser available and it signals "malformed" exclusively via a thrown `RangeError`.
