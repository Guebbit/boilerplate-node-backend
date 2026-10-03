---
source: src/app/config.ts
sha256: 31a1f09f950ac803c8e1dcb1bb507fd73cab5e15c84a2938fe2e00f0720e1e79
generated_at: 2026-10-01T12:44:08.375988+00:00
model: ollama:qwen3.8:27b
---

# src/app/config.ts

## Purpose

Central configuration assembly point for the application. It defines the app tier's own runtime variables (HTTP bounds, security.txt fields), aggregates every infrastructure and kernel config slice into a single list, and exposes a validation entry point (`assertProcessConfig`) for processes that never call `createApp()`.

## Key elements

- **`appConfig`** — `defineConfig` slice covering `NODE_JSON_BODY_LIMIT`, HTTP timeout bounds, `NODE_TRUST_PROXY_HOPS`, and the three `NODE_SECURITY_*` security.txt fields.
- **`infrastructureRateLimits`** (module-private) — wraps `INFRASTRUCTURE_RATE_LIMITS` into a named slice so the shared budgets participate in validation.
- **`securityTxtSettings()`** — merges `appConfig()` output with `siteConfig().NODE_URL` into the `SecurityTxtSettings` shape consumed by the security.txt builder.
- **`APP_CONFIG_SLICES`** — readonly array of every non-module `ConfigSlice` (runtime, database, security, adapters, HTTP, i18n, observability, kernel, app). This is the list a boot validates before any module loads.
- **`allConfigSlices(appModules)`** — `APP_CONFIG_SLICES` plus each enabled module's own slices (via `configSlicesOf`), in stable order.
- **`assertProcessConfig()`** — calls `assertConfig(allConfigSlices(enabledModules))`; throws `ConfigError` on any mismatch. Intended for the cluster primary and `runScript` entry points.

## Relationships

- **`src/app.ts`** — calls `assertProcessConfig()` (or `allConfigSlices`) during boot before registering modules.
- **`src/app/security-txt.ts`** — defines the `SecurityTxtSettings` type that `securityTxtSettings()` returns; reads those settings to render `/.well-known/security.txt`.
- **`src/infrastructure/config/define.ts`** — provides `defineConfig`, `assertConfig`, and the `ConfigSlice` type used throughout.
- **`src/infrastructure/config/fields.ts`** — provides `int` and `text` field constructors used in `appConfig`.
- **`src/infrastructure/adapters/config.ts`** — source of the adapter slices (mail, redis, image, pdf, queue, antibot).
- **`src/infrastructure/adapters/antibot-providers/index.ts`** — supplies `humanChallengeProviderProbe`, a provider-selector validation slice.
- **`src/infrastructure/http/config.ts`** — supplies HTTP-layer slices (site, rate-limit, upload, response-cache, idempotency).
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — exports `INFRASTRUCTURE_RATE_LIMITS` consumed by the `infrastructureRateLimits` slice.
- **`src/infrastructure/i18n/config.ts`** — supplies `localeConfig`.
- **`src/infrastructure/observability/analytics/index.ts`** — supplies `analyticsProviderProbe`.
- **`scripts/run-script.ts`** — calls `assertProcessConfig()` so all 11 ops scripts fail fast on a bad environment.
- **`scripts/setup/required-keys.ts`** — reads the slice list to enumerate required environment variables.
- **`scripts/docs/generate-config-reference.ts`** — walks `APP_CONFIG_SLICES` (and module slices) to generate the configuration reference doc.

## Notes

- `APP_CONFIG_SLICES` deliberately excludes module-owned slices; use `allConfigSlices(enabledModules)` when you need the full picture.
- `assertProcessConfig()` exists because the cluster primary and `runScript` never go through `createApp()`, yet still need a single, clear validation error instead of every worker crash-looping.
- The three `NODE_SECURITY_*` fields are optional — if unset, `security.txt` is not published (no 404, just absent).
- `NODE_TRUST_PROXY_HOPS` defaults to `0`; set it to match your actual proxy chain to avoid X-Forwarded-For spoofing or incorrect client-IP bucketing.
- The security.txt builder reads from `securityTxtSettings()`, not directly from `appConfig` — the `NODE_URL` field comes from `siteConfig`, not this slice.
