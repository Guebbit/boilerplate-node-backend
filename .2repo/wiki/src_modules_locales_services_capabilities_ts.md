# src/modules/locales/services/capabilities.ts

## Purpose

The locale manifest service. It merges two tiers of languages — those deployed as static files and those registered as database rows — into a single sorted `LocaleCapabilities` list, and exposes the query surface (`listCapabilities`, `listTenants`) that `GET /locales` and related endpoints consume.

## Key elements

- **`isRightToLeft(tag)`** — checks a tag's base language against a hardcoded set of 13 RTL scripts (`ar`, `he`, `fa`, `ur`, …).
- **`describeLanguage(tag, inLanguage)`** — returns a language's display name in another language via `Intl.DisplayNames`; falls back to the raw tag on malformed input or missing ICU data.
- **`staticCapability(tag)`** — builds a `LocaleCapability` for a file-deployed language: always `active`, `source: static`, `tenants: [backendTenant()]`, `entryCount: 0`.
- **`dynamicCapability(language, entryCount)`** — builds a `LocaleCapability` from a `LocaleDocument` row: `source: dynamic`, `tenants: [frontendTenant()]`.
- **`mergeCapabilities(staticTags, dynamicLanguages, entryCounts)`** — seeds a `Map` with static rows, overlays dynamic rows on top. A tag present in both tiers becomes one row with `source: both` and both tenants. Returns a `localeCompare`-sorted array.
- **`readDynamicTier(scope?)`** — reads dynamic languages and per-locale entry counts from the repositories in parallel. Catches all errors, logs a warning, and returns empty results so the static tier survives a DB outage.
- **`callerScope`** — a `createVisibilityScope(localeRepository.publicScope)` guard; `undefined` for admins (no filter), active-only for other callers.
- **`listCapabilities(scope?)`** — orchestrates `readDynamicTier` → `mergeCapabilities(listSupportedLocales(), …)` and attaches `default` / `fallback` from the i18n catalog. The primary entry point.
- **`listTenants()`** — passthrough to `../tenants.listTenants`, kept here so the controller does not import the tenant module directly.

## Relationships

- **`src/types/index.ts`** — source of `LocaleDirection`, `LocaleSource`, `LocaleCapabilities`, `LocaleCapability`, `LocaleTenantDescriptor`.
- **`src/infrastructure/i18n/index.ts` / `catalog.ts`** — supplies `getDefaultLocale`, `getFallbackLocale`, `listSupportedLocales` (the static tag list).
- **`src/modules/locales/model.ts`** — provides `deriveBaseLanguage` (used by `isRightToLeft`) and the `LocaleDocument` type.
- **`src/modules/locales/repository.ts`** — `localeRepository.list` and `localeMessageRepository.countEntriesByLocale` are the two DB reads inside `readDynamicTier`.
- **`src/modules/locales/tenants.ts`** — `backendTenant()`, `frontendTenant()`, and `listTenants` are consumed for tenant assignment and the passthrough export.
- **`src/kernel/authorization.ts`** — `createVisibilityScope` builds `callerScope`.
- **`src/infrastructure/adapters/logger.ts`** — `logger.warn` is called in the `readDynamicTier` catch path.
- **`src/modules/locales/services/index.ts`** — barrel that re-exports this module for consumers.
- **`src/modules/locales/tests/unit/service.test.ts`** — unit tests for the functions above.

## Notes

- The RTL set is intentionally hardcoded; `Intl.Locale.prototype.getTextInfo` is avoided because its availability varies across runtime deployments.
- `readDynamicTier` swallows errors **by design**: a Mongo failure degrades to static-only rather than returning a 500. The warning log is the only trace.
- When a tag appears in both tiers, the dynamic side's display fields (`name`, `nativeName`, `direction`, `active`, `revision`) win; the static side contributes nothing beyond the `backendTenant` in the merged tenant list.
- The `active` flag on a dynamic row gates *visitor* selection. Admins (scope = `undefined`) always see every row.
- `describeLanguage` catches `Intl.DisplayNames` exceptions (malformed tags) and returns the tag itself — a wrong label is preferred over an unhandled throw.
