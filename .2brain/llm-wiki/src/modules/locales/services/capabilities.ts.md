---
source: src/modules/locales/services/capabilities.ts
sha256: fc4ab91d917c81d5bb458b9dbe461eb0e1cb3bb4b573c9fcbc042afee60fc815
generated_at: 2026-09-27T15:00:39.885772+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/capabilities.ts

## Purpose

Builds the locale manifest for a deployment: which languages are available and what each can do. Merges two tiers — statically deployed language files and dynamically registered database rows — into a single, stable `LocaleCapability[]` without conflating their sources. Also exposes the access-control scope that gates which rows a caller may read.

## Key elements

- **`isRightToLeft(tag)`** – Returns whether a tag's base language is RTL, checked against a hardcoded `Set` of base codes.
- **`describeLanguage(tag, inLanguage)`** – Returns a language's display name via `Intl.DisplayNames`; falls back to the raw tag on invalid input or missing ICU data.
- **`staticCapability(tag)`** – Builds a `LocaleCapability` for a file-deployed language (always active, backend tenant only, `source: static`).
- **`dynamicCapability(language, entryCount)`** – Builds a `LocaleCapability` from a `LocaleDocument` row (frontend tenant, `source: dynamic`).
- **`mergeCapabilities(staticTags, dynamicLanguages, entryCounts)`** – Combines both tiers into one tag-keyed list. Overlapping tags yield a single row with both tenants and `source: both`, using the dynamic side's display fields. Result is sorted by tag.
- **`readDynamicTier(scope?)`** – Reads dynamic languages and per-locale entry counts via the repositories. Catches and swallows any DB error (logs at `warn`, returns empty) so a Mongo outage degrades to static-only rather than failing entirely.
- **`callerScope(context?)`** – Delegates to `accessibleFilter(context, 'Locale')`; returns `undefined` for admins (no filter) or an active-only filter for everyone else.
- **`listCapabilities(scope?)`** – Top-level orchestrator: calls `readDynamicTier`, merges with `listSupportedLocales()`, and attaches `default`/`fallback` locales.

## Relationships

- **`@infrastructure/i18n`** (`catalog.ts`, `index.ts`) – Supplies `getDefaultLocale`, `getFallbackLocale`, `listSupportedLocales` used to seed the static tier and the response's default/fallback fields.
- **`@infrastructure/adapters/logger.ts`** – `logger.warn` is the sole output when the dynamic tier read fails.
- **`@kernel/access/query.ts`** – `accessibleFilter` provides the row-level scope applied in `readDynamicTier`.
- **`../model.ts`** – `deriveBaseLanguage` (used by `isRightToLeft`) and the `LocaleDocument` type (consumed by `dynamicCapability` / `mergeCapabilities`).
- **`../repository.ts`** – `localeRepository.list` and `localeEntryRepository.countEntriesByLocale` are the two DB calls in `readDynamicTier`.
- **`../tenants.ts`** – `backendTenant()` and `frontendTenant()` produce the tenant descriptors attached to each capability.
- **`@types`** (`index.ts`, `auth-context.ts`) – `LocaleCapability`, `LocaleCapabilities`, `LocaleDirection`, `LocaleSource`, `AuthContext`.
- **`services/index.ts`** – Barrel that re-exports this module for external consumers.
- **`tests/unit/service.test.ts`** – Unit tests for the functions above.

## Notes

- **Deliberate error swallowing in `readDynamicTier`:** A database failure must never prevent the static (file-based) tier from being served. The catch returns `{ languages: [], entryCounts: new Map() }` and logs a `warn`. Stryker mutation annotations suppress mutations on this path so the tests don't flag it as dead code.
- **RTL determination avoids `Intl.Locale.prototype.getTextInfo`** because its availability varies across Node/deployment targets; a plain `Set` lookup is used instead.
- **Merge semantics:** When a tag exists in both tiers, the dynamic side's `name`/`nativeName`/`direction`/`active`/`revision` win (the static side has no real display metadata). Tenants are `[backend, frontend]` and `source` is set to `LocaleSource.both`.
- **`active` vs. admin visibility:** The `active` flag gates what a visitor may select. Admins (scope `undefined`) see all rows regardless of the flag.
- **`describeLanguage` is best-effort:** It wraps `Intl.DisplayNames` in a try/catch because the constructor throws on malformed BCP-47 tags; the tag itself is the guaranteed fallback.
