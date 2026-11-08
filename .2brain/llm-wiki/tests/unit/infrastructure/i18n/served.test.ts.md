---
source: tests/unit/infrastructure/i18n/served.test.ts
sha256: 75cc17d92cbb01bcbb2f813c2c43ccdb93de71e5ad8ce28cff21d1f38b2566b3
generated_at: 2026-11-08T10:19:59.203847+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/i18n/served.test.ts

## Purpose

Unit tests for the "served languages" rule: a language is served only when it is switched on in the override provider **and** has a deployed translation file. The tests verify that `listServedLocales`, per-request context creation, out-of-request `translator` binding, and the draft/preview helpers all honour that single rule — including the fallback-to-default-language path for switched-off or file-less languages.

## Key elements

- **`describe('the served languages')`** — main suite; initialises `i18next` per test (global resource isolation, same rationale as `overrides.test.ts`).
- **`describe('listServedLocales')`** — asserts ordering (fallback first), inclusion of newly-on languages, exclusion of switched-off ones, fallback immutability, and deduplication.
- **`describe('one refresh fills the copy and the languages together')`** — exercises `registerLocaleOverrideProvider` + `refreshLocaleOverrides`; verifies that a failed refresh preserves the last good list (stale-beats-flapping).
- **`describe('hasServedDictionary')`** — true only when the language is on **and** a file exists.
- **`describe('the context a request runs in')`** — `createLocaleContext` locale selection, per-key fallback for file-less languages, regional-tag (`it-CH`) resolution through its base language, and `runWithLocale` ambient `t` binding.
- **`describe('translator')`** — out-of-request binding (mail builders); confirms fallback wording and that no `console.warn` is emitted for unknown languages.
- **`describe('draft languages')`** — `draftLocaleFor` naming/normalisation rules (case-insensitive, excludes on/unknown/regional/fallback tags); `createPreviewContext` keeps the draft tag visible while API wording still falls back.
- **`languagesOf`** — small factory returning a `LocaleOverlay` with only `activeTags`/`inactiveTags` populated.

## Relationships

- **`src/infrastructure/i18n/index.ts`** — single import point; every function and type under test (`listServedLocales`, `createLocaleContext`, `translator`, `refreshLocaleOverrides`, `draftLocaleFor`, `createPreviewContext`, `setServedLanguages`, `resetServedLanguages`, etc.) is re-exported from here.
- **`src/infrastructure/i18n/served.ts`** — the module under test; defines `listServedLocales`, `isServedLocale`, `hasServedDictionary`, `setServedLanguages`, `resetServedLanguages`, and `draftLocaleFor`.
- **`src/infrastructure/i18n/context.ts`** — provides `createLocaleContext`, `createPreviewContext`, `runWithLocale`, and the per-key `t` fallback logic exercised throughout.
- **`src/infrastructure/i18n/overrides.ts`** — provides `registerLocaleOverrideProvider`, `refreshLocaleOverrides`, `resetLocaleOverrides`, and the `LocaleOverlay` type used by the `languagesOf` helper.
- **`src/infrastructure/i18n/catalog.ts`** — source of `listSupportedLocales`, `getFallbackLocale`, and `loadLocaleResources`, all used in the `i18next.init` setup block.

## Notes

- `i18next` is re-initialised in `beforeEach` of every top-level suite because its resource store is a module-level global; a leaked bundle would make later tests order-dependent.
- The "stale beats flapping" test (provider rejects) documents an intentional product decision: a transient backend error must not silently drop a language for visitors already mid-session.
- `draftLocaleFor` normalises case (`'DE'` → `'de'`) but returns `undefined` for regional tags of a draft (e.g. `de-AT`), active languages, unknown tags, and the fallback — a broader surface than the name suggests.
- `createPreviewContext` differs from `createLocaleContext` only in that it preserves the draft tag as `locale` and sets `preview: true`; the `t` binding still resolves API wording through the fallback, so preview shows product copy in the draft language but API errors in the default.
