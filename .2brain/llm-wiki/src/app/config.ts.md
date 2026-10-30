---
source: src/app/config.ts
sha256: 93b9e4ccca2b9b127c0a259f92d7ec2827de6f1b0cd37987b4a1a88a24ba3478
generated_at: 2026-10-29T01:49:53.017596+00:00
model: ollama:qwen3.8:27b
---

# src/app/config.ts

## Purpose

Central configuration registry for the application. It defines the app tier's own server-bound and security.txt variables, assembles every infrastructure, kernel, and module config slice into a single canonical list, and exposes the validation entry point (`assertProcessConfig`) used by every process entry (app boot, cluster primary, ops scripts) to fail fast on a bad environment.

## Key elements

- **`appConfig`** — `defineConfig` slice holding the app tier's own vars: JSON body limit, HTTP header/request/keep-alive timeouts, trust-proxy hops, and the three `NODE_SECURITY_*` fields for security.txt.
- **`securityTxtSettings()`** — merges `appConfig()` with `siteConfig().NODE_URL` and returns the `SecurityTxtSettings` shape consumed by the security.txt builder.
- **`infrastructureRateLimits`** — wraps the static `INFRASTRUCTURE_RATE_LIMITS` map into a named rate-limit budget slice.
- **`APP_CONFIG_SLICES`** — ordered, read-only array of every non-module `ConfigSlice` (runtime, security, adapters, HTTP, i18n, analytics, kernel, app). This is the "environment" a boot validates.
- **`allConfigSlices(appModules)`** — concatenates `APP_CONFIG_SLICES` with each enabled module's own slices (via `moduleConfigSlices`) to produce the full per-process list.
- **`assertProcessConfig()`** — calls `assertConfig(allConfigSlices(enabledModules))`; throws `ConfigError` on the first invalid value. Intended for entry points that bypass `createApp()`.

## Relationships

- **`src/infrastructure/config/define.ts`** — provides `defineConfig`, `assertConfig`, and the `ConfigSlice` type used throughout.
- **`src/infrastructure/config/fields.ts`** — provides the `int` and `text` field constructors for `appConfig`.
- **`src/infrastructure/adapters/config.ts`** — supplies adapter-level slices (mail, queue, redis, image, pdf, export-store, outbound, antibot, etc.) included in `APP_CONFIG_SLICES`.
- **`src/infrastructure/adapters/antibot-providers/index.ts`** — exports `humanChallengeProviderProbe`, a probe slice that validates the provider selector name at boot.
- **`src/infrastructure/adapters/mail-transports.ts`** — exports `mailTransportProbe`, same probe pattern for mail transport selection.
- **`src/infrastructure/http/config.ts`** — supplies `siteConfig`, `rateLimitConfig`, `responseCacheConfig`, `idempotencyConfig`, `uploadConfig`.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — exports the `INFRASTRUCTURE_RATE_LIMITS` constant wrapped into the `infrastructureRateLimits` slice.
- **`src/infrastructure/i18n/config.ts`** — supplies `localeConfig`.
- **`src/infrastructure/observability/analytics/index.ts`** — exports `analyticsProviderProbe` (provider-name validation).
- **`src/app/security-txt.ts`** — defines the `SecurityTxtSettings` interface that `securityTxtSettings()` must satisfy.
- **`src/app.ts` / `src/app/system-routes.ts`** — consume `appConfig` and `securityTxtSettings()` at runtime.
- **`scripts/run-script.ts`** — calls `assertProcessConfig()` so every ops script validates the environment before executing.
- **`scripts/setup/required-keys.ts`** — references the same slice names during setup/key-scaffolding.

## Notes

- The ordering of `APP_CONFIG_SLICES` is stable and intentional; consumers may rely on it for consistent error-reporting order.
- `assertProcessConfig` uses the module-level `enabledModules` import (from `../modules`), so it always validates against the current deployment's module set without needing `createApp()`.
- Probes (`humanChallengeProviderProbe`, `mailTransportProbe`, `analyticsProviderProbe`) are slices whose sole purpose is to validate a provider-name string against a registry at boot — a typo here crashes the process before the first request.
- `NODE_SECURITY_CONTACT`, `NODE_SECURITY_EXPIRES`, `NODE_SECURITY_POLICY_URL` are required (no default) in `appConfig`; a deployment missing any of them will fail `assertProcessConfig`.
