---
source: src/modules/locales/services/capabilities.ts
sha256: 03a406de80a6b78d48eb7757aec10d07568454ac126a3fe22287421356f50688
generated_at: 2026-11-14T20:21:03.638438+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/capabilities.ts

## Purpose

Builds the `GET /locales` manifest: a single merged list of every language the deployment offers, split into two tiers (file-deployed/static and row-registered/dynamic), each annotated with its capabilities (direction, apps, actions, entry count). It also provides the single-language read (`readLanguage`) and the write-response helper (`describeStoredLanguage`), all under the same scoping and standing rules so list, detail, and mutation responses are representationally identical.

## Key elements

- **`isRightToLeft(tag)`** — Returns whether a locale's base language is RTL, using a hardcoded `Set` of 13 base tags (avoids `Intl.Locale#getTextInfo` whose availability varies by runtime).
- **`describeLanguage(tag, inLanguage)`** — Resolves a language's display name in a target language via `Intl.DisplayNames`; falls back to the raw tag on malformed input or missing ICU data.
- **`staticCapability(tag, active?)`** — Shapes a file-deployed language into a `Language` object (LTR/RTL from the set, `entryCount: 0`, `apps: [backendApp()]`, `actions: NO_ACTIONS`).
- **`dynamicCapability(row, entryCount, standing?)`** — Shapes a registered row into a `Language` object; wraps it in `carryVersion` so the revision counter rides alongside the wire shape for `ETag` derivation.
- **`mergeCapabilities(staticTags, dynamicLanguages, entryCounts, inactiveTags?, standing?)`** — Combines both tiers into one tag-keyed list. A tag present in both produces a single row with `apps: [backend, frontend]` and `source: both`. Result is sorted by tag.
- **`readDynamicTier(scope?)`** — Reads dynamic rows, entry counts, and inactive tags in parallel. **Intentionally swallows** any database failure (logs at `warn`), returning empty collections so the static tier is always served.
- **`callerScope(caller?)`** — Delegates to `accessibleFilterFor(caller, 'Locale')` to produce the Mongo query scope for this caller.
- **`readStanding(caller?)`** — Returns the `LanguageStanding` (CRUD actions) the caller may see, gated by `standingOnRead`.
- **`listCapabilities(scope?, standing?)`** — Top-level entry point: calls `readDynamicTier`, merges with `listSupportedLocales()`, and returns `{ locales, default, fallback }`.
- **`readLanguage(tag, scope?, standing?)`** — Reads one language through `listCapabilities` and returns `generateSuccess` or `languageNotFound()`.
- **`describeStoredLanguage(document, standing)`** — Re-derives the manifest shape for a single just-written row (used as the write response body); guarantees the tag appears by filtering `listSupportedLocales()` to that tag.

## Relationships

- **`src/modules/locales/model.ts`** — Imports `deriveBaseLanguage` and the `LocaleDocument` type used throughout the shaping functions.
- **`src/modules/locales/repository.ts`** — Exports the `localeRepository` and `localeEntryRepository` instances; this file calls their list, count, and inactive-tag methods inside `readDynamicTier` and `describeStoredLanguage`.
- **`src/modules/locales/services/actions.ts`** — Imports `NO_ACTIONS`, `NO_STANDING`, `languageActions`, `standingOnRead`, and the `LanguageStanding` type to annotate each language row with its permitted actions.
- **`src/modules/locales/apps.ts`** — Imports `backendApp` and `frontendApp` to stamp the `apps` array on each capability row.
- **`src/modules/locales/services/languages.ts`** — Imports `languageNotFound` for the 404 response in `readLanguage`.
- **`src/infrastructure/i18n/index.ts`** (re-exports from `catalog.ts` and `locale-tag.ts`) — Provides `canonicalLocale`, `getDefaultLocale`, `getFallbackLocale`, `listSupportedLocales`.
- **`src/infrastructure/http/response.ts`** — Imports `generateSuccess` and the `ResponseSuccess`/`ResponseReject` union types for response shaping.
- **`src/infrastructure/adapters/logger.ts`** — Logs the dynamic-tier degradation warning in `readDynamicTier`.
- **`src/infrastructure/persistence/versioning.ts`** — `carryVersion` wraps shaped objects so the `revision` counter is available for `ETag` derivation.
- **`src/kernel/access/query.ts`** — `accessibleFilterFor` produces the Mongo scope from a `Caller`.
- **`src/types/auth-context.ts`** — `Caller` type parameterises `callerScope` and `readStanding`.
- **`src/modules/locales/services/index.ts`** — Re-exports this module's public API.
- **`src/modules/locales/tests/unit/service.test.ts`** — Unit-tests the functions in this file.

## Notes

- **Graceful degradation is intentional.** `readDynamicTier` catches all DB errors and returns empty collections. The static tier (file-deployed languages) is the guaranteed floor for `GET /locales`; a Mongo outage costs only the dynamic half.
- **`active` on a static row is not self-determined.** A deployed file has no off-switch; it is `active: false` only if a *registered row* for the same tag is switched off. The row still appears so a frontend that bundled the language knows to stop offering it.
- **Stryker mutation-testing annotations** (`// Stryker disable all` / `restore all`) surround the `catch` block in `readDynamicTier` to prevent mutation testing from altering the error-swallowing path.
- **`_id` vs `id`.** Dynamic rows come from `.lean()` (pre-transform), so the code reads `_id` and stringifies it manually rather than relying on Mongoose's `id` virtual.
- **`describeLanguage` deliberately catches** `Intl.DisplayNames` exceptions (thrown on malformed tags). The eslint-disable is scoped to that single line.
- **`describeStoredLanguage`** calls the full entry-count query to find the one tag's count — there is no per-tag count method in the repository surface used here.
