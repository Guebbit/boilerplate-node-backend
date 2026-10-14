---
source: src/app/config.ts
sha256: 8ac85468aac7b376ae09c1e3886af82059bb3d222d644e7614117b30dd8a91d6
generated_at: 2026-10-14T07:37:42.745194+00:00
model: ollama:qwen3.8:27b
---

# src/app/config.ts

## Purpose

Defines the app tier's own environment variables (HTTP parsing/connection bounds, security.txt fields) and assembles the complete, flat list of every config slice owned by infrastructure, the kernel, and the app tier itself. Provides the single boot-time validation entry point (`assertProcessConfig`) so that any process start—app boot, cluster primary, or ops script—judges the environment identically.

## Key elements

- **`appConfig`** — The app tier's own `defineConfig` slice: JSON body limit, HTTP header/request/keep-alive timeouts, trust-proxy hop count, and three `security.txt` fields.
- **`infrastructureRateLimits`** — Wraps `INFRASTRUCTURE_RATE_LIMITS` (from the rate-limit middleware) into a named slice so it participates in the same validation pass as user-defined rate-limit configs.
- **`securityTxtSettings()`** — Returns a `SecurityTxtSettings` object by merging `appConfig()` with `NODE_URL` from `siteConfig`, for the `/.well-known/security.txt` builder.
- **`APP_CONFIG_SLICES`** — Ordered `readonly ConfigSlice[]` of every non-module slice (infrastructure, kernel, app). Each entry is a config-accessor function; the array maps them to their `.slice` property.
- **`allConfigSlices(appModules)`** — Prepends `APP_CONFIG_SLICES` with each enabled module's own slices (via `moduleConfigSlices`), giving the full set for a process.
- **`assertProcessConfig()`** — Calls `assertConfig` over `allConfigSlices(enabledModules)`. Intended for entry points that never call `createApp()`: the cluster primary and `runScript`.

## Relationships

- **`src/infrastructure/config/define.ts` / `fields.ts`** — Provides the `defineConfig`, `assertConfig`, `ConfigSlice` types and the `int`/`text` field builders used throughout this file.
- **`src/infrastructure/adapters/config.ts`** — Source of most adapter-level slices (mail, redis, queue, image, PDF, export-store, outbound, antibot).
- **`src/infrastructure/adapters/antibot-providers/index.ts`** — Contributes `humanChallengeProviderProbe`, a boot-time validation of the selected provider name.
- **`src/infrastructure/adapters/mail-transports.ts`** — Contributes `mailTransportProbe`, same pattern for mail transport selection.
- **`src/infrastructure/http/config.ts`** — Source of HTTP-layer slices (site, rate-limit, upload, response-cache, idempotency).
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Exports `INFRASTRUCTURE_RATE_LIMITS`, wrapped into a slice here.
- **`src/infrastructure/i18n/config.ts`** — Provides `localeConfig`.
- **`src/infrastructure/observability/analytics/index.ts`** — Contributes `analyticsProviderProbe`.
- **`src/app/security-txt.ts`** — Type-only import of `SecurityTxtSettings`, the shape `securityTxtSettings()` returns.
- **`src/app.ts`** — The app boot path (`registerModules` → `createApp`) reads `allConfigSlices` to validate before wiring; this file is the canonical slice list it consults.
- **`scripts/run-script.ts`** — Calls `assertProcessConfig()` at the top of every ops script so a bad environment fails fast with one clear error instead of a mid-script crash.

## Notes

- **Probes vs. slices.** Entries like `mailTransportProbe` and `humanChallengeProviderProbe` are not simple value validators; they check that a provider *name* exists in a registry that imports its own config. A typo in a provider name is caught at boot, not on the first request.
- **Two-stage assembly.** `APP_CONFIG_SLICES` deliberately excludes module-owned slices. `allConfigSlices` is the only place where the two are merged. Adding a new infrastructure slice means editing `APP_CONFIG_SLICES`; adding a module slice means exporting it from that module's `AppModule.config`.
- **`assertProcessConfig` vs. in-app validation.** The in-app path (`createApp`) calls `registerModules`, which adds module slices and validates. `assertProcessConfig` is the equivalent for processes that skip `createApp` entirely (cluster primary, scripts). They must stay in sync; the single source of truth is `allConfigSlices`.
- **Stable ordering.** Slices are listed in a fixed order. Reordering is cosmetic for validation but matters if any downstream tooling or diffing depends on the sequence.
