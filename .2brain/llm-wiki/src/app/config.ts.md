---
source: src/app/config.ts
source_sha256: d5c3800da8bb47e868182b9ad87e6361aed9632bb122e087a68786bb80854fa8
context_sha256: 0c7dc4aebda5a1292570e9bcc8c6e1e8d99fa03f971e5ba48268c8315c34b10a
generated_at: 2026-11-22T02:29:53.302372+00:00
model: claude-code:claude-sonnet-5-5
---

# src/app/config.ts

## Purpose
Defines the app tier's own environment configuration and assembles the single list of every config slice a process validates at boot. Infrastructure, kernel, app and per-module slices are all judged in one pass, so a bad environment is refused at startup rather than on first use.

## Key elements
- `appConfig` — `defineConfig` slice named `app`. Variables:
  - `NODE_JSON_BODY_LIMIT` (default `100kb`)
  - `NODE_HTTP_HEADERS_TIMEOUT_MS` (default 15000)
  - `NODE_HTTP_REQUEST_TIMEOUT_MS` (default 2 minutes)
  - `NODE_HTTP_KEEP_ALIVE_TIMEOUT_MS` (default 5000)
  - `NODE_TRUST_PROXY_HOPS` (default 0)
  - `NODE_SECURITY_CONTACT`, `NODE_SECURITY_EXPIRES`, `NODE_SECURITY_POLICY_URL` (plain text, no default)
- `infrastructureRateLimits` (not exported) — a `rateLimitBudgetConfig` slice named `infrastructure-rate-limits`, built from `INFRASTRUCTURE_RATE_LIMITS`.
- `securityTxtSettings()` — returns the parsed `appConfig()` merged with `NODE_URL` from `siteConfig()`, for the security.txt builders.
- `APP_CONFIG_SLICES` — every infrastructure, kernel and app slice (runtime, security, mail, queue, redis, image, pdf, export store, outbound, antibot, site, rate limits, upload, response cache, idempotency, SSE, locale, persistence, analytics, reauth, outbox, app). Each accessor is mapped to its `.slice`.
- `allConfigSlices(appModules)` — `APP_CONFIG_SLICES` followed by `moduleConfigSlices(appModules)`.
- `assertProcessConfig()` — runs `assertConfig` over `allConfigSlices(enabledModules)` and throws `ConfigError` if anything is wrong.

## Relationships
- Imports slice definitions from `src/infrastructure/config/define.ts` (`defineConfig`, `assertConfig`) and `src/infrastructure/config/fields.ts` (`int`, `text`).
- Pulls in slices from `src/infrastructure/adapters/config.ts` and `src/infrastructure/http/config.ts`. It also uses `INFRASTRUCTURE_RATE_LIMITS` from `src/infrastructure/http/middlewares/rate-limit.ts`.
- Includes the provider probes `humanChallengeProviderProbe` (`src/infrastructure/adapters/antibot-providers/index.ts`) and `mailTransportProbe` (`src/infrastructure/adapters/mail-transports.ts`).
- Uses `MINUTE_MS` from `src/domain-primitives/time.ts`.
- `src/app/security-txt.ts` supplies the `SecurityTxtSettings` type, and `securityTxtSettings()` feeds its builders. `src/app/security.ts` and `src/app/system-routes.ts` are neighbors in the graph. Per the doc comments, `registerModules` and `runScript` read `APP_CONFIG_SLICES`.
- `scripts/run-script.ts` is the entry point `assertProcessConfig` is written for. `scripts/setup/required-keys.ts`, `src/app.ts` and `src/app/worker-process.ts` are also graph neighbors.

## Notes
- Provider selectors are validated through "probe" slices (`mailTransportProbe`, `humanChallengeProviderProbe`, `analyticsProviderProbe`). Their valid names live in registries that import their own config, so a typo fails at boot.
- `assertProcessConfig` is for entry points that bypass `createApp()`. App boot validates through `registerModules`, which adds each manifest's slices.
- `enabledModules` is imported from `../modules`, so the module list is fixed at import time.
- Slices are listed in a fixed order.
