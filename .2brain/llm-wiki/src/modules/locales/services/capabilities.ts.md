---
source: src/modules/locales/services/capabilities.ts
sha256: 98c86b336d02d7bf181e2923a04ee77cf78712dc9afe02481bfcb8e611e65bb9
generated_at: 2026-10-15T10:45:07.971851+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/capabilities.ts

## Purpose

The locale manifest service. It assembles the single capabilities list returned by `GET /locales` by merging two tiers — languages shipped as deployment files (static) and languages registered as database rows (dynamic) — into one sorted array that states which apps can serve each language, its direction, and its activity status.

## Key elements

- **`isRightToLeft(tag)`** — checks a tag's base language against a hardcoded `Set` of RTL codes (avoids `Intl.Locale.prototype.getTextInfo` for portability).
- **`describeLanguage(tag, inLanguage)`** — resolves a human-readable language name via `Intl.DisplayNames`; falls back to the raw tag on malformed input or missing ICU data.
- **`staticCapability(tag)`** — builds a `LocaleCapability` for a file-based language: always `active`, `apps: [backendApp()]`, `entryCount: 0`.
- **`dynamicCapability(language, entryCount)`** — builds a `LocaleCapability` for a row-based language: `apps: [frontendApp()]`, carries the row's `active` flag and `revision`.
- **`mergeCapabilities(staticTags, dynamicLanguages, entryCounts)`** — combines both tiers into a tag-keyed `Map`. A tag present in both tiers gets `apps: [backend, frontend]` and `source: both`, using the dynamic side's display fields. Returns an array sorted by tag.
- **`readDynamicTier(scope?)`** — runs `localeRepository.list` + `localeEntryRepository.countEntriesByLocale` in parallel; catches and logs DB failures at `warn`, returning empty results so the static tier still ships.
- **`callerScope(context?)`** — delegates to `accessibleFilter(context, 'Locale')`; `undefined` for admins (unrestricted), `{active: true}` for visitors.
- **`listCapabilities(scope?)`** — top-level entry point: calls `readDynamicTier`, then `mergeCapabilities` with `listSupportedLocales()`, and attaches `default`/`fallback` locales.

## Relationships

- **`src/modules/locales/model.ts`** — provides `deriveBaseLanguage` and the `LocaleDocument` type used by `dynamicCapability` and `mergeCapabilities`.
- **`src/modules/locales/repository.ts`** — `localeRepository.list` and `localeEntryRepository.countEntriesByLocale` are the data sources for the dynamic tier.
- **`src/modules/locales/apps.ts`** — supplies `backendApp()` and `frontendApp()` identifiers stamped onto each capability row.
- **`src/infrastructure/i18n/index.ts`** (re-exports `catalog.ts`) — provides `listSupportedLocales`, `getDefaultLocale`, `getFallbackLocale` consumed by `listCapabilities`.
- **`src/kernel/access/query.ts`** — `accessibleFilter` enforces the visitor-vs-admin visibility rule on the `scope` parameter.
- **`src/infrastructure/adapters/logger.ts`** — `logger.warn` emits the diagnostic when the dynamic tier is unavailable.
- **`src/types/index.ts`** — defines `LocaleCapability`, `LocaleCapabilities`, `LocaleDirection`, `LocaleSource`, and `AuthContext` used throughout.
- **`src/modules/locales/services/index.ts`** — barrel that re-exports this module's public API.
- **`src/modules/locales/tests/unit/service.test.ts`** — unit-tests the functions in this file.

## Notes

- Static languages have no off-switch: `active` is always `true` and `apps` is backend-only. There is no client-facing dictionary to download.
- A database outage intentionally degrades to static-only output (empty `languages`, empty `entryCounts`). The catch block is annotated with `// Stryker disable all` to prevent mutation-testing from "fixing" the deliberate empty-return.
- `active` gates what a *visitor* may select; the admin reads all rows regardless. This is the same convention as other entities (products, users).
- `describeLanguage` catches `Intl.DisplayNames` exceptions rather than validating the tag beforehand — a manifest that reads `es` is preferred over a 500.
- The merged list is sorted by `tag.localeCompare` to guarantee a stable ordering across API responses.
