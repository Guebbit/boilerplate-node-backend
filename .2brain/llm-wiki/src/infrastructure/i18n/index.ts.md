---
source: src/infrastructure/i18n/index.ts
sha256: 3e6d9ae37dec102a65fa20d345b22f8c6ebd56ee6a5398c77262760f4508c699
generated_at: 2026-09-27T14:12:04.428036+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/i18n/index.ts

## Purpose

Barrel (facade) file for the request-scoped i18n subsystem. It is the **single import point** for translation infrastructure across the codebase (~70 call-sites use the `@infrastructure/i18n` alias), re-exporting four sub-modules—`./catalog`, `./boot`, `./overrides`, `./context`—so callers never touch `i18next` directly. This keeps the one-global i18next instance out of the per-request path; the per-request translator lives in `./context`.

## Key elements

- **`t`** – the per-request translation function (from `./context`). Always import this, not `i18next`'s default export.
- **`translator`** – factory/instance behind `t`; also from `./context`.
- **`LocaleContext`** (type) – the typed context object that carries the active locale and dictionary for a single request.
- **`createLocaleContext`, `runWithLocale`, `runWithLocaleContext`, `getCurrentLocale`, `getLocaleContext`** – context lifecycle helpers (from `./context`).
- **`bootI18n`** (from `./boot`) – one-time startup of the shared i18next instance; call once at app boot, not per request.
- **Catalog exports** (`getDefaultLocale`, `getFallbackLocale`, `listSupportedLocales`, `loadLocaleResources`, `localeCandidatesFor`, `readLocaleDictionary`, `registerLocaleDirectories`, `resetSupportedLocales`) – translation resource loading and locale-resolution chain (from `./catalog`).
- **Overrides exports** (`applyLocaleOverrides`, `refreshLocaleOverrides`, `registerLocaleOverrideProvider`, `startLocaleOverrideRefresh`, `stopLocaleOverrideRefresh`, `isLocaleOverrideAvailable`, `getOverrideRefreshMs`, `resetLocaleOverrides`, `LocaleOverrideProvider`) – admin-side live translation overlay with a polling refresh cycle (from `./overrides`).

## Relationships

- **`src/infrastructure/http/middlewares/locale.ts`** – owns `Accept-Language` negotiation via `request.acceptsLanguages`. This module explicitly does **not** parse `Accept-Language` itself; it consumes the locale that the middleware has already resolved.
- **`src/app.ts`, `src/app/demo.ts`, `src/app/error-handling.ts`** – import `t` and/or `bootI18n` through this barrel for app-level messages and startup.
- **`src/infrastructure/http/controller.ts`, `errors.ts`, `frontend-link.ts`** – import `t` for user-facing strings.
- **`src/infrastructure/http/middlewares/human-challenge.ts`, `idempotency.ts`, `rate-limit.ts`, `upload.ts`** – import `t` for middleware error/hint strings.
- **`scenarios/locales.ts`, `scenarios/products.ts`** – integration/scenario tests that exercise the exports re-exported here.
- **`scripts/ops/reap-inactive-accounts.ts`, `sweep-reservations.ts`** – operational scripts that import `t` (or catalog helpers) for CLI output.

## Notes

- **Never import `i18next` directly** in application code. Its default export is a single global instance with one active language; this barrel routes through `./context` so each request gets its own translator bound to the correct locale.
- The JSDoc header points to `docs/tools/i18n.md` for the broader i18n design.
- Two concerns are **deliberately excluded** from this directory: (1) `Accept-Language` parsing (lives in the locale middleware) and (2) the translation *port* / published vocabulary (lives in `kernel/translation.ts`), mirroring the inversion pattern used by `kernel/authentication.ts`.
