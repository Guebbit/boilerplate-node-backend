---
source: src/modules/locales/services/capabilities.ts
sha256: ef8860556eee115118664bc7b0afc662dbb63a414530b9fd02f79bdb362bfb77
generated_at: 2026-09-23T18:51:16.358184+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/capabilities.ts

## Purpose

Builds the deployment's language manifest — a single list describing every offered language (static file-based and dynamic row-based), what each can do, and which tenant surface serves it. It is the service layer behind `GET /locales`, combining i18n infrastructure metadata with repository reads into a stable, sorted response.

## Key elements

- **`isRightToLeft(tag)`** — Returns `true` if the tag's base language is in a hardcoded RTL set (avoids `Intl.Locale.prototype.getTextInfo` for cross-runtime reliability).
- **`describeLanguage(tag, inLanguage)`** — Human-readable language name via `Intl.DisplayNames`; falls back to the raw tag on malformed input or missing ICU data.
- **`staticCapability(tag)`** — Builds a `LocaleCapability` row for a file-deployed language (always active, backend-tenant only, `LocaleSource.static`).
- **`dynamicCapability(language, entryCount)`** — Builds a `LocaleCapability` row for a row-registered language (frontend-tenant only, `LocaleSource.dynamic`).
- **`mergeCapabilities(staticTags, dynamicLanguages, entryCounts)`** — Unifies both tiers into one `LocaleCapability[]`; a tag present in both gets `LocaleSource.both` and both tenants. Output sorted by tag for stable diffs.
- **`readDynamicTier(scope?)`** — Parallel-fetches dynamic languages and per-locale entry counts from the repository. Catches and logs failures, returning empty results so the static tier is never lost to a DB outage.
- **`callerScope(context?)`** — Delegates to `accessibleFilter(context, 'Locale')`; returns `undefined` for admins (unrestricted) or an active-only filter for visitors.
- **`listCapabilities(scope?)`** — The main entry point: reads the dynamic tier, merges with static tags from i18n infrastructure, and assembles the final `LocaleCapabilities` object (locales + default + fallback).

## Relationships

- **`@infrastructure/i18n`** (`catalog.ts` / `index.ts`) — Supplies `listSupportedLocales`, `getDefaultLocale`, and `getFallbackLocale` used in `listCapabilities`.
- **`@infrastructure/adapters/logger`** — Emits a `warn`-level log when the dynamic tier read fails.
- **`@kernel/access/query`** — Provides `accessibleFilter`, the shared rule that translates an `AuthContext` into a row-level scope.
- **`../model`** — Provides the `deriveBaseLanguage` helper and the `LocaleDocument` type consumed by `dynamicCapability` and `mergeCapabilities`.
- **`../repository`** — `localeRepository.list` and `localeEntryRepository.countEntriesByLocale` are the data sources for the dynamic tier.
- **`../tenants`** — `backendTenant()` and `frontendTenant()` produce the tenant identifiers stamped onto capability rows.
- **`@types`** (`auth-context.ts` / `index.ts`) — Source of `LocaleDirection`, `LocaleSource`, `LocaleCapabilities`, `LocaleCapability`, and `AuthContext` types.
- **`tests/unit/service.test.ts`** — Unit tests exercising the merge, RTL, and fault-tolerance behavior of this module.

## Notes

- **Graceful degradation by design:** `readDynamicTier` catches all errors and returns empty results. A Mongo outage degrades the response to static-only; it never produces a 500. The catch block carries `Stryker disable/restore` annotations to exclude it from mutation testing.
- **Tenant semantics are asymmetric:** static languages are backend-tenant only (the API answers in them; no dictionary to download). Dynamic languages are frontend-tenant only (downloadable dictionaries). A merged tag gets both.
- **`active` field:** For dynamic languages it gates what a *visitor* may select; admins always see all rows. Static languages are unconditionally `active: true`.
- **`entryCount`** is always `0` for static languages — there is no dictionary table behind them.
- The RTL set is intentionally hardcoded rather than derived from `Intl.Locale` to avoid runtime availability differences across Node versions.
