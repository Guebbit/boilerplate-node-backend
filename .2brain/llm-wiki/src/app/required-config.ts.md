---
source: src/app/required-config.ts
sha256: ee2434f6823457834f8e68312ce6e2befb8d2ee35f2a4597eb9fad68592b2088
generated_at: 2026-09-27T14:02:36.885462+00:00
model: ollama:qwen3.8:27b
---

# src/app/required-config.ts

## Purpose

Collects the boot-time configuration checks that belong to the application itself—neither to the kernel nor to any module. Because the kernel is forbidden from naming a specific module or adapter, these "app-level" gates live here and are handed to `registerModules` as the `NonModuleChecks` argument the kernel's `assertRequiredConfig` expects.

## Key elements

- **`APP_REQUIRED_CONFIG`** (internal `const`, not exported) — a `readonly RequiredConfig[]` declaring three env-var gates: `NODE_URL` (always), `NODE_CORS_ORIGIN` (production only), `NODE_LOG_HASH_KEY` (production only, min 16 chars, placeholder provided).
- **`APP_NON_MODULE_CHECKS`** (exported, type `NonModuleChecks`) — the single object `src/app.ts` passes to `registerModules`. Combines the above `required` array with four `customChecks`:
  - `missingSmtpCompanions` (delegated to `adapters/mailer.ts`)
  - `checkSelector('NODE_ANALYTICS_PROVIDER', resolveAnalyticsProvider)`
  - `checkSelector('NODE_MAIL_TRANSPORT', resolveMailTransport)`
  - `checkSelector('NODE_LOG_PERSONAL_FIELDS', resolvePersonalFieldMode)`

## Relationships

- **`src/app.ts`** — imports `APP_NON_MODULE_CHECKS` and forwards it to `registerModules` as the non-module checks argument.
- **`src/kernel/required-config.ts`** — source of the `checkSelector` helper and the `NonModuleChecks` type that shapes this file's export; its `assertRequiredConfig` is the consumer of the data produced here.
- **`src/kernel/registry.ts`** — defines the `RequiredConfig` type used for each entry in `APP_REQUIRED_CONFIG`; also codifies the rule (kernel must not name a module/adapter) that justifies this file's existence.
- **`src/infrastructure/adapters/mailer.ts`** — provides `missingSmtpCompanions` and `resolveMailTransport`, both referenced directly in `customChecks`.
- **`src/infrastructure/adapters/logger.ts`** — provides `resolvePersonalFieldMode`, used via `checkSelector`.
- **`src/infrastructure/observability/analytics/index.ts`** — provides `resolveAnalyticsProvider`, used via `checkSelector`.
- **`scripts/setup/required-keys.ts`** — mirrors the same env-var keys for the first-run/setup script; keeping them in sync with `APP_REQUIRED_CONFIG` is a manual obligation.
- **`tests/unit/app/required-config.test.ts`** — unit-tests this file's exports.
- **`tests/unit/scripts/setup/first-run.test.ts`** — exercises the setup path that depends on the same key list.

## Notes

- `NODE_PAYMENT_PROVIDER` and `NODE_ANTIBOT_PROVIDER` are deliberately **absent** here; those selectors are probed by their respective modules' own `customCheck` in `payments/module.ts` and `antibot/module.ts`. Adding them here would violate the module-ownership boundary.
- `NODE_CORS_ORIGIN` and `NODE_LOG_HASH_KEY` carry `productionOnly: true`—they are skipped in dev/test. `NODE_URL` is unconditional because an unset value silently produces a broken OAuth redirect rather than a loud error.
- The file contains no runtime logic beyond the object literal; all "checking" is delegated to the imported helpers. Modifying a gate means editing the array/selector list here, not writing new validation code.
