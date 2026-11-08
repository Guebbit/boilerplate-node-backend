---
source: src/modules/locales/services/capabilities.ts
sha256: 58957b8a529d633801b2cc1bb44abc9af4ce3305ea9339961b3b50cdc44fff57
generated_at: 2026-11-08T06:24:57.709348+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/capabilities.ts

## Purpose

Builds the locale capability manifest for a deployment: merges the static tier (languages shipped as files) with the dynamic tier (languages registered as database rows) into a single sorted list, and exposes read functions (`listCapabilities`, `readLanguage`, `describeStoredLanguage`) that the HTTP layer and write-confirmation responses call to produce a consistent representation of "which languages exist and what each can do."

## Key elements

- **`isRightToLeft(tag)`** — Returns whether a tag's base language is RTL, using a hardcoded `Set` of base-language codes (avoids `Intl.Locale.getTextInfo` due to uneven deployment availability).
- **`describeLanguage(tag, inLanguage)`** — Localises a language's display name via `Intl.DisplayNames`; falls back to the raw tag on bad input or missing ICU data.
- **`staticCapability(tag, active)`** — Shapes a file-only language into a `Language` object (source `static`, apps `[backendApp]`, `NO_ACTIONS`, zero entry count/revision).
- **`dynamicCapability(language, entryCount, standing)`** — Shapes a registered row into a `Language` object (source `dynamic`, apps `[frontendApp]`, carries optional `id`/timestamps, populates `actions` via `languageActions`).
- **`mergeCapabilities(staticTags, dynamicLanguages, entryCounts, inactiveTags, standing)`** — Unifies both tiers into a `Map` keyed by tag; a tag present in both becomes a single row with `source: 'both'` and both apps. Returns the list sorted by tag.
- **`readDynamicTier(scope?)`** — Reads languages, entry counts, and inactive tags from the repositories in parallel. Catches and logs (warn) any DB failure, returning empty collections so the static tier is still served.
- **`callerScope(caller?)`** — Delegates to `accessibleFilterFor(caller, 'Locale')` to produce the row-level filter for the current caller.
- **`readStanding(caller?)`** — Wraps `standingOnRead` with `callerScope` to determine what actions the caller may perform on registered languages.
- **`listCapabilities(scope?, standing?)`** — Orchestrates `readDynamicTier` + `mergeCapabilities` and returns the full `LocaleCapabilities` (locales list, default, fallback).
- **`readLanguage(tag, scope?, standing?)`** — Reads through `listCapabilities`, finds the matching tag, or returns a 404 via `languageNotFound()`.
- **`describeStoredLanguage(document, standing)`** — Produces the manifest-shaped row for a single just-written document (used as a write response), filtering static tags to match and merging with the single document.

## Relationships

- **`@infrastructure/i18n`** — Imports `getDefaultLocale`, `getFallbackLocale`, `listSupportedLocales` to supply the static tag list and the default/fallback locale in the response.
- **`@infrastructure/http/response`** — Imports `generateSuccess` and the `ResponseSuccess`/`ResponseReject` union for building the single-read response.
- **`@infrastructure/adapters/logger`** — Uses `logger.warn` when the dynamic tier read fails.
- **`@types`** — Consumes `LocaleDirection`, `LocaleSource`, `Language`, `LocaleCapabilities`, and `Caller` type definitions.
- **`@kernel/access/query`** — Calls `accessibleFilterFor` inside `callerScope` to derive the row-level access filter for the `Locale` resource.
- **`../model`** — Uses `deriveBaseLanguage` for tag decomposition and the `LocaleDocument` shape for dynamic rows.
- **`../repository`** — Reads from `localeRepository` (list, listInactiveTags) and `localeEntryRepository` (countEntriesByLocale).
- **`./languages`** — Reuses `languageNotFound` for the 404 path in `readLanguage`.
- **`../apps`** — Imports `backendApp` and `frontendApp` factory functions to populate the `apps` array on each capability row.
- **`./actions`** — Imports `NO_ACTIONS`, `NO_STANDING`, `languageActions`, `standingOnRead`, and the `LanguageStanding` type to wire per-caller action permissions into the manifest.
- **`tests/unit/service.test.ts`** — Unit-tests the functions in this module.

## Notes

- The static tier is **guaranteed to be present** in the response even if the database is down; `readDynamicTier` swallows the error at `warn` level and returns empty collections. This is an intentional resilience choice, not a bug.
- A tag present in **both** tiers merges into one row with `source: 'both'` and both apps; the dynamic side's display fields (name, nativeName, direction, active) win because only that side carries them.
- `active: false` does **not** remove a language from the list — it is retained so a client that already bundled the dictionary knows to stop offering it. The `inactiveTags` set gates visibility, not existence.
- `readLanguage` deliberately reads through `listCapabilities` rather than querying the repository directly, ensuring the single-read, list, and write-confirmation responses share the same scoping and shape "by construction."
- `describeStoredLanguage` filters `listSupportedLocales()` to the single tag before merging, guaranteeing the row is always found in the result (no null-check needed).
- The RTL check uses a hardcoded list rather than `Intl.Locale.prototype.getTextInfo` because the latter's availability varies across Node.js/ICU deployments.
- Stryker mutation-testing annotations (`Stryker disable all` / `Stryker restore all`) wrap the error-handling block in `readDynamicTier`, indicating that block is intentionally excluded from mutation coverage.
