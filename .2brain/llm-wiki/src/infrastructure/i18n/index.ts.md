---
source: src/infrastructure/i18n/index.ts
sha256: d8ea365174cc839a384c53a05ae586078a771d7e7d2154ef3d391d6bb8bfcfc9
generated_at: 2026-10-29T02:07:07.595395+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/i18n/index.ts

## Purpose

Barrel (re-export) file that is the **sole public entry point** for all i18n functionality. It exists to keep the global `i18next` instance out of the request path — callers always get a per-request `t` via `./context` rather than a shared singleton with one active language. Every consumer (~70 import sites) imports from `@infrastructure/i18n`, never from `i18next` directly.

## Key elements

- **`./catalog` re-exports** — `getDefaultLocale`, `getFallbackLocale`, `listSupportedLocales`, `loadLocaleResources`, `localeCandidatesFor`, `readLocaleDictionary`, `registerLocaleDirectories`, `resetSupportedLocales`. Manages which locales exist, their resource loading, and the candidate-chain resolution.
- **`./boot` re-exports** — `bootI18n`. One-time shared-instance startup.
- **`./overrides` re-exports** — `applyLocaleOverlay`, `applyLocaleOverrides`, `getOverrideRefreshMs`, `isLocaleOverrideAvailable`, `refreshLocaleOverrides`, `registerLocaleOverrideProvider`, `resetLocaleOverrides`, `startLocaleOverrideRefresh`, `stopLocaleOverrideRefresh`, plus types `LocaleOverlay` and `LocaleOverrideProvider`. Admin overlay: swap or augment translations at runtime with an optional periodic refresh.
- **`./served` re-exports** — `dictionaryLocaleFor`, `draftLocaleFor`, `hasServedDictionary`, `isServedLocale`, `listServedLocales`, `resetServedLanguages`, `servedLocaleFor`, `setServedLanguages`. Tracks which languages a given request may actually be answered in (i.e., which dictionaries are loaded/available).
- **`./context` re-exports** — `createLocaleContext`, `createPreviewContext`, `getCurrentLocale`, `getLocaleContext`, `runWithLocale`, `runWithLocaleContext`, **`t`**, `translator`, plus type `LocaleContext`. The per-request translation function and its surrounding context (AsyncLocalStorage-based).

## Relationships

- **`src/infrastructure/http/middlewares/locale.ts`** — Explicitly *not* this file's concern. `attachLocale` in that middleware performs the `Accept-Language` → locale decision via `request.acceptsLanguages`; this barrel only consumes the resulting locale.
- **Consumers (all ~70 import sites)** — `src/app.ts`, `src/app/error-handling.ts`, `src/infrastructure/http/errors.ts`, `src/infrastructure/http/middlewares/*` (content-type, human-challenge, idempotency, json-depth, origin), `scenarios/locales.ts`, `scenarios/products.ts`, `scenarios/support/demo.ts`, `scripts/ops/run-job.ts`, and others all `import { … } from '@infrastructure/i18n'` resolving to this file. They never reach into the submodules directly.
- **`kernel/translation.ts`** (referenced in the module doc) — Owns the *translation port* (the module-level vocabulary contract), the same inversion pattern as `kernel/authentication.ts`. This barrel is the *implementation-side* surface, not the port definition.

## Notes

- **Do not import `i18next` directly** in application code. The default export of `i18next` is a single global instance with one active language; using it inside a request handler silently breaks per-request isolation. Always go through this barrel (specifically `t` / `runWithLocale` from `./context`).
- **Accept-Language parsing** is deliberately owned by `locale.ts` middleware (using `request.acceptsLanguages`), not by any helper in `./catalog`. Don't add a hand-rolled parser to the catalog.
- The module doc points to `docs/tools/i18n.md` for the full design rationale.
