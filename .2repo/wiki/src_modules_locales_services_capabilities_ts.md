# src/modules/locales/services/capabilities.ts

## Purpose

Builds the locale capability manifest — the unified, sorted list of every language a deployment offers (file-based "static" and row-based "dynamic") along with what each can do, which tenants serve it, and its direction. It also exposes the tenant list and the visibility scope, making this file the single read-side surface for `GET /locales` and `GET /locales/tenants`.

## Key elements

- **`RIGHT_TO_LEFT_BASE_LANGUAGES`** — module-private `Set` of 13 base-language codes treated as RTL. Consulted only for static languages; dynamic languages declare their own direction.
- **`isRightToLeft(tag)`** — returns whether a locale tag is RTL by checking its derived base language against the set above.
- **`describeLanguage(tag, inLanguage)`** — returns the human-readable name of `tag` as seen in `inLanguage` via `Intl.DisplayNames`; falls back to the raw tag on `RangeError` or missing ICU data.
- **`staticCapability(tag)`** — constructs a `LocaleCapability` for a file-deployed language: always `active`, only `backendTenant()`, `source: static`, zero entries.
- **`dynamicCapability(language, entryCount)`** — constructs a `LocaleCapability` for a row-based language: carries the row's `active` flag, only `frontendTenant()`, `source: dynamic`.
- **`mergeCapabilities(staticTags, dynamicLanguages, entryCounts)`** — combines both tiers into one array. A tag present in both becomes a single row with `source: both` and both tenants. Result is sorted by tag (`localeCompare`).
- **`readDynamicTier(scope?)`** — fetches `localeRepository.list(scope)` and `localeMessageRepository.countEntriesByLocale()` concurrently. On database failure, logs a warning and returns empty arrays so the static tier still ships.
- **`callerScope`** — `createVisibilityScope(localeRepository.publicScope)`; `undefined` for admins (unrestricted), active-only filter for visitors.
- **`listCapabilities(scope?)`** — top-level entry point. Calls `readDynamicTier`, then `mergeCapabilities(listSupportedLocales(), …)`, and returns `{ locales, default, fallback }`.
- **`listTenants()`** — thin passthrough to `configuredTenants()` from `../tenants`; exists so the controller never reaches into the tenants module directly.

## Relationships

- **`@types`** (`src/types/index.ts`) — provides `LocaleDirection`, `LocaleSource`, `LocaleCapabilities`, `LocaleCapability`, `LocaleTenantDescriptor`.
- **`@infrastructure/i18n`** (`src/infrastructure/i18n/index.ts` → `catalog.ts`) — supplies `listSupportedLocales()` (the static tag list), `getDefaultLocale()`, `getFallbackLocale()`.
- **`@infrastructure/adapters/logger`** — `logger.warn` is the sole error channel in `readDynamicTier`.
- **`@kernel/authorization`** — `createVisibilityScope` builds `callerScope` from the repository's public scope.
- **`../model`** — `deriveBaseLanguage` (used by `isRightToLeft`) and the `LocaleDocument` type (parameter of `dynamicCapability` / `mergeCapabilities`).
- **`../repository`** — `localeRepository` (list + `publicScope`) and `localeMessageRepository` (`countEntriesByLocale`).
- **`../tenants`** — `backendTenant()`, `frontendTenant()`, and `listTenants as configuredTenants`.
- **`services/index.ts`** — re-exports this module as part of the `localeService` surface.
- **`tests/unit/service.test.ts`** — unit-tests the functions above.

## Notes

- The RTL set is intentionally hardcoded (13 codes) instead of relying on `Intl.Locale.prototype.getTextInfo` so the answer is identical across every Node worker regardless of ICU build.
- `readDynamicTier` is the **only** catch in this module. A Mongo outage degrades the dynamic tier to empty rather than failing the whole `GET /locales`; the static tier (in-memory file list) always ships.
- Static languages are hard-coded `active: true` with no off-switch; only dynamic (row) languages can be toggled via the admin surface.
- When a tag appears in both tiers, the merged row takes its display fields from the dynamic side (the static side has no stored name) and sets `source: both` with both tenants.
- `listTenants` lives here (not beside the write path) so `services/index.ts` remains the complete read surface and the controller stays agnostic of where the tenant list originates.
