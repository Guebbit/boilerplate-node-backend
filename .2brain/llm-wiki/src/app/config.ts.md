---
source: src/app/config.ts
sha256: 158f9cc4686cd3b018351d2a9b82513744a1e2aa34bc5cc2f5767e9eca218a9e
generated_at: 2026-11-14T17:47:58.753602+00:00
model: ollama:qwen3.8:27b
---

# src/app/config.ts

## Purpose

Central assembly point for every configuration slice a process validates at boot. It defines the app tier's own variables (HTTP server bounds, `security.txt` fields), imports every infrastructure/kernel slice, and exposes a single list plus a validation entry point so that app boot, the cluster primary, and ops scripts all judge the environment identically.

## Key elements

- **`appConfig`** – `defineConfig` block for the app tier's own env vars: JSON body limit, header/request/keep-alive timeouts, trust-proxy hop count, and `NODE_SECURITY_*` fields.
- **`infrastructureRateLimits`** – Wraps `INFRASTRUCTURE_RATE_LIMITS` as a named config slice (budgets that no single module owns).
- **`securityTxtSettings()`** – Convenience accessor returning `SecurityTxtSettings` (app contact fields + `NODE_URL` from `siteConfig`).
- **`APP_CONFIG_SLICES`** – Readonly array of every non-module config slice (runtime, security, adapters, HTTP, i18n, observability, kernel, app). Each entry is the `.slice` property of its accessor.
- **`allConfigSlices(appModules)`** – Concatenates `APP_CONFIG_SLICES` with the slices contributed by each enabled module's manifest.
- **`assertProcessConfig()`** – Calls `assertConfig(allConfigSlices(enabledModules))`; the single gate for entry points that bypass `createApp()` (cluster primary, `runScript`).

## Relationships

- **`src/infrastructure/config/define.ts`** – Source of `defineConfig`, `assertConfig`, and the `ConfigSlice` type used throughout.
- **`src/infrastructure/config/fields.ts`** – Provides `int` and `text` field constructors used in `appConfig`.
- **`src/infrastructure/adapters/config.ts`** – Supplies the adapter slices (mail, queue, redis, image, pdf, export-store, outbound, antibot).
- **`src/infrastructure/adapters/antibot-providers/index.ts`** – Provides `humanChallengeProviderProbe`, a boot-time validation of the selected provider name.
- **`src/infrastructure/adapters/mail-transports.ts`** – Provides `mailTransportProbe`, similarly a boot-time selector check.
- **`src/infrastructure/http/config.ts`** – Supplies HTTP-layer slices (site, rate-limit, upload, cache, idempotency, SSE).
- **`src/infrastructure/http/middlewares/rate-limit.ts`** – Source of `INFRASTRUCTURE_RATE_LIMITS`, wrapped into the `infrastructureRateLimits` slice.
- **`src/infrastructure/i18n/config.ts`** – Supplies `localeConfig`.
- **`src/domain-primitives/time.ts`** – Provides `MINUTE_MS` used for the default request timeout.
- **`src/app/security-txt.ts`** – Type source for `SecurityTxtSettings`, consumed by `securityTxtSettings()`.
- **`src/app.ts`** – App boot path that ultimately calls `assertConfig` via module registration; this file ensures the same slice list is used.
- **`scripts/run-script.ts`** – Calls `assertProcessConfig()` so ops scripts fail fast on a bad environment.
- **`scripts/setup/required-keys.ts`** – Consumes the slice list to enumerate required environment keys for setup tooling.

## Notes

- The file intentionally does **not** import module-specific slices directly; those are attached at call time via `moduleConfigSlices(enabledModules)` inside `allConfigSlices`. This keeps the import graph acyclic (modules import from `@infrastructure/*`, not back to `@app/config`).
- Probe entries (`mailTransportProbe`, `humanChallengeProviderProbe`, `analyticsProviderProbe`) are not simple `defineConfig` slices—they are validation closures that check a provider *name* against a registry. A typo is caught at boot, not on the first request.
- `APP_CONFIG_SLICES` order is stable and deliberate; consumers that enumerate keys (e.g. `required-keys.ts`) may rely on it.
