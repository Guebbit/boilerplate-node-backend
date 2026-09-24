---
source: src/infrastructure/i18n/index.ts
sha256: 6a704a72222b18901f33660f1bae18fd82ef5a6cc6d64eff3e21149a0f0bbbd4
generated_at: 2026-09-23T17:47:17.110092+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/i18n/index.ts

## Purpose

Barrel (re-export) entry point for the request-scoped i18n subsystem. It exists so that all ~70 consumer sites import `t` and locale utilities from the `@infrastructure/i18n` alias rather than from `i18next` directly, keeping the global i18next instance out of the per-request code path. It owns no logic; it simply re-exports three submodules (`./catalog`, `./overrides`, `./context`) under one flat namespace.

## Key elements

- **`./catalog` exports** — `getDefaultLocale`, `getFallbackLocale`, `listSupportedLocales`, `loadLocaleResources`, `localeCandidatesFor`, `readLocaleDictionary`, `registerLocaleDirectories`, `resetSupportedLocales`. Handles locale discovery, resource loading, and the pure candidate-chain resolution.
- **`./overrides` exports** — `applyLocaleOverrides`, `getOverrideRefreshMs`, `refreshLocaleOverrides`, `registerLocaleOverrideProvider`, `resetLocaleOverrides`, `startLocaleOverrideRefresh`, `stopLocaleOverrideRefresh`, `LocaleOverrideProvider` (type). Admin-side overlay that can hot-swap translation strings at a configurable interval.
- **`./context` exports** — `createLocaleContext`, `getCurrentLocale`, `getLocaleContext`, `runWithLocale`, `runWithLocaleContext`, `t`, `translator`, `LocaleContext` (type). Per-request translation context; `t` is the callable translator bound to the active request's locale.

## Relationships

- **`src/infrastructure/http/middlewares/locale.ts`** — `attachLocale` (in that middleware) resolves the client's `Accept-Language` via `request.acceptsLanguages` and then calls into this module's context to set the active locale for the request. This file deliberately does *not* re-implement language negotiation.
- **`src/infrastructure/http/validation-messages.ts`**, **`src/app/error-handling.ts`**, **`src/infrastructure/http/middlewares/{human-challenge,idempotency,rate-limit,upload}.ts`**, **`src/infrastructure/http/controller.ts`**, **`src/infrastructure/http/request.ts`** — consumer sites that import `t` (or `getLocaleContext`) from this barrel to obtain translated user-facing strings.
- **`src/app.ts`** / **`src/app/demo.ts`** — application bootstrap; expected to call `registerLocaleDirectories` and/or `startLocaleOverrideRefresh` during startup.
- **`scenarios/locales.ts`** / **`scenarios/products.ts`** — test/scenario fixtures that exercise locale resolution and translated product data.
- **`scripts/ops/reap-inactive-accounts.ts`** — operational script that may pull translated messages for operator-facing output.

## Notes

- Import path is always the alias `@infrastructure/i18n` (i.e., this file). Do not deep-import `./catalog`, `./context`, etc. from outside the directory.
- Two concerns are explicitly **outside** this module: `Accept-Language` parsing (owned by `http/middlewares/locale.ts`) and the translation *port* abstraction (owned by `kernel/translation.ts`). Don't add logic here for either.
- `localeCandidatesFor` is a pure function (no side effects) and is the only catalog export intended for use outside the server runtime.
- The override refresh timer (`startLocaleOverrideRefresh` / `stopLocaleOverrideRefresh`) is a process-wide singleton; call `stop` before `reset` in teardown paths to avoid dangling intervals.
