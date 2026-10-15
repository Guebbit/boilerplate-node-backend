---
source: tests/unit/app/config.test.ts
sha256: dd7e81da3d6e8d399853250b25a3231564541230893dc0d349f69be25a23bcff
generated_at: 2026-10-15T13:03:30.528946+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/app/config.test.ts

## Purpose

Validates the **contents** of `APP_CONFIG_SLICES` (the app tier's boot-time environment-variable checks) by running them through `assertModuleConfig` exactly the way `src/app.ts` wires them. It does not test the gate mechanism itself (that lives in `tests/unit/kernel/module-config.test.ts`); it asserts *which* variables are required, which are `productionOnly`, which form groups, and which enum values are accepted.

## Key elements

- **`withoutEnvironmentInThisFile([...])`** — module-level call that clears every listed `NODE_*` variable in a `beforeEach`, so each test starts from a known-empty environment.
- **`configure()`** — minimal helper: sets `NODE_ENV=development` and a valid `NODE_URL`, satisfying every unconditional check so tests can isolate a single slice.
- **`assertApp()`** — one-liner wrapper: `assertModuleConfig([], APP_CONFIG_SLICES)`, mirroring the call site in `src/app.ts`.
- **`e2eSmtp(host)`** — configures a full SMTP transport (host, credentials, sender) plus `NODE_E2E_RUN=1` for the e2e-mail-guard tests.
- **`afterEach` → `resetAnalyticsProvider()`** — resets the memoised analytics singleton so a provider resolved in one test doesn't leak into the next.
- **`describe` blocks** (grouped by concern):
  - *application-wide variables* — `NODE_URL` (always), `NODE_CORS_ORIGIN` / `NODE_FRONTEND_URL` / `NODE_PSEUDONYM_KEY` (production/staging only).
  - *a bare environment* — confirms mail, antibot, and email-policy all default off.
  - *the SMTP group* — host requires user/pass/sender together.
  - *the mail guards* — e2e runs (`NODE_E2E_RUN=1`) restrict `NODE_SMTP_HOST` to local addresses (`localhost`, `127.0.0.1`, `::1`, `mailpit`) or allow `log`/`outbox` transports unconditionally.
  - *provider-selector group* — rejects unrecognised values for `NODE_ANALYTICS_PROVIDER`, `NODE_MAIL_TRANSPORT`, `NODE_LOG_PERSONAL_FIELDS`, `NODE_ANTIBOT_PROVIDER` at boot.
  - *antibot provider group* — enforces per-provider secret requirements (Altcha signing key, Turnstile site-key + secret pair).
  - *antibot email-policy group* — accepts `disposable` / `mx`, rejects unknown values.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/app/config.ts` | Source of `APP_CONFIG_SLICES`, the array of slice descriptors under test. |
| `src/kernel/module-config.ts` | Source of `assertModuleConfig`, the evaluation engine that interprets the slices. This file delegates all gate logic to it. |
| `src/infrastructure/observability/analytics/index.ts` | `resetAnalyticsProvider()` is called in `afterEach` to clear the memoised provider that `assertModuleConfig` may resolve while validating `NODE_ANALYTICS_PROVIDER`. |
| `tests/support/environment.ts` | Provides `withoutEnvironmentInThisFile` (batch-clear env vars) and `setEnvironment` (per-test override). |

## Notes

- **Every test must set `NODE_ENV` away from `'test'`.** `assertModuleConfig` short-circuits entirely under the test environment, so a suite that forgets this will pass silently while asserting nothing.
- **`productionOnly` slices** (`NODE_CORS_ORIGIN`, `NODE_FRONTEND_URL`, `NODE_PSEUDONYM_KEY`) are accepted when unset in `development` but rejected in `production`, `staging`, or when `NODE_ENV` is unset.
- **Antibot checks live here, not in the antibot module's manifest.** The human-challenge gate they validate is cross-cutting middleware called by `account` and `feedback`; it runs even if the antibot HTTP routes are unmounted, so the validation can't be tied to a module that might be deleted.
- **`NODE_E2E_RUN=1` + real SMTP host** is explicitly rejected (the host must match a local-sink pattern) to prevent e2e tests from sending mail to a production relay.
