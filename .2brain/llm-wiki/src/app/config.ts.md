---
source: src/app/config.ts
sha256: cc4b96fce87ce0a9c7ac6e888a58e8fe04e47364f6eaa36c614b390332d407b0
generated_at: 2026-11-08T03:12:50.018647+00:00
model: ollama:qwen3.8:27b
---

# src/app/config.ts

## Purpose

Defines the application tier's own environment variables (HTTP server bounds, security.txt contact fields) and assembles the single flat list of every configuration slice that a process must validate at boot. This is the one place where "the whole environment" is judged in a pass, shared by the app, the cluster primary, and ops scripts.

## Key elements

- **`appConfig`** — `defineConfig` slice for app-tier variables: JSON body limit, HTTP header/request/keep-alive timeouts, trust-proxy hops, and the three `security.txt` contact fields.
- **`infrastructureRateLimits`** (module-local) — wraps `INFRASTRUCTURE_RATE_LIMITS` from the rate-limit middleware into a `ConfigSlice` so it participates in boot validation.
- **`securityTxtSettings()`** — merges `appConfig()` with `siteConfig().NODE_URL` and returns a `SecurityTxtSettings` object for the security.txt route builder.
- **`APP_CONFIG_SLICES`** — ordered, readonly array of every infrastructure, kernel, and app `ConfigSlice` (including provider probes). This is the stable "non-module" baseline.
- **`allConfigSlices(appModules)`** — returns `APP_CONFIG_SLICES` followed by each enabled module's own slices, in stable order.
- **`assertProcessConfig()`** — calls `assertConfig(allConfigSlices(enabledModules))`; throws `ConfigError` on any invalid value. Intended for entry points that bypass `createApp()`.

## Relationships

- **`src/infrastructure/config/define.ts`** — source of `defineConfig`, `assertConfig`, and the `ConfigSlice` type used throughout.
- **`src/infrastructure/config/fields.ts`** — provides the `int` and `text` field constructors for `appConfig`'s shape.
- **`src/infrastructure/adapters/config.ts`** — supplies the adapter-level slices (mail, redis, queue, image, pdf, etc.) included in `APP_CONFIG_SLICES`.
- **`src/infrastructure/adapters/mail-transports.ts`** / **`src/infrastructure/adapters/antibot-providers/index.ts`** — contribute `mailTransportProbe` and `humanChallengeProviderProbe`; their valid provider names are checked at boot, not at first request.
- **`src/infrastructure/http/config.ts`** — provides site, rate-limit, upload, response-cache, and idempotency slices.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — exports `INFRASTRUCTURE_RATE_LIMITS`, folded into `infrastructureRateLimits`.
- **`src/infrastructure/i18n/config.ts`** — provides `localeConfig` slice.
- **`src/domain-primitives/time.ts`** — `MINUTE_MS` used as the default for `NODE_HTTP_REQUEST_TIMEOUT_MS`.
- **`src/app/security-txt.ts`** — defines the `SecurityTxtSettings` type that `securityTxtSettings()` returns.
- **`scripts/run-script.ts`** — calls `assertProcessConfig()` so every ops script fails fast on a bad environment.
- **`src/app.ts`** — the app creation path that also validates config (via `registerModules`); this file's `assertProcessConfig` mirrors that same check for non-app entry points.

## Notes

- `APP_CONFIG_SLICES` is a **snapshot** (`.map` at module load). The order is stable and matters for error-message readability; don't reorder casually.
- `assertProcessConfig` is the "fail before the process starts" gate. The cluster primary calls it once so a single clean error replaces N worker crash-loops.
- Provider probes (`mailTransportProbe`, `humanChallengeProviderProbe`, `analyticsProviderProbe`) are slices whose valid *names* live in a registry that imports its own config — a typo is caught at boot, not on the first incoming request.
- Module-specific slices are **not** in `APP_CONFIG_SLICES`; they are appended by `allConfigSlices` per the enabled `AppModule` list from `src/modules`.
