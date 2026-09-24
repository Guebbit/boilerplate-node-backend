---
source: src/app/required-config.ts
sha256: 8f964ce5947255a1643b732d58556975a125689c1c103c70e49adddef0f633a4
generated_at: 2026-09-23T17:35:44.385576+00:00
model: ollama:qwen3.8:27b
---

# src/app/required-config.ts

## Purpose

Holds boot-time configuration checks that belong to the application itself rather than to any single module or adapter. Because the kernel is forbidden from naming a module or adapter by name, these "orphan" checks cannot live in a module manifest or in the kernel; they are collected here and handed to `registerModules` as the `NonModuleChecks` argument the kernel expects.

## Key elements

- **`APP_REQUIRED_CONFIG`** — `readonly RequiredConfig[]` listing the two env vars that are the app's own business: `NODE_URL` (unconditional) and `NODE_CORS_ORIGIN` (production-only).
- **`APP_NON_MODULE_CHECKS`** (export) — the single `NonModuleChecks` object consumed by `src/app.ts`. Bundles `required: APP_REQUIRED_CONFIG` with four `customChecks`:
    - `missingSmtpCompanions` (imported from the mailer adapter)
    - `checkSelector('NODE_ANALYTICS_PROVIDER', resolveAnalyticsProvider)`
    - `checkSelector('NODE_MAIL_TRANSPORT', resolveMailTransport)`
    - `checkSelector('NODE_LOG_PERSONAL_FIELDS', resolvePersonalFieldMode)`
- **`checkSelector`** (imported from `@kernel/required-config`) — normalises a resolver's throw into the same failure shape every other check produces, so a wrong provider name fails at boot rather than on first use.

## Relationships

- **`src/app.ts`** — imports `APP_NON_MODULE_CHECKS` and passes it as the `NonModuleChecks` parameter to `registerModules`.
- **`src/kernel/required-config.ts`** — source of the `NonModuleChecks` type and the `checkSelector` helper used here.
- **`src/kernel/registry.ts`** — source of the `RequiredConfig` type used by `APP_REQUIRED_CONFIG`.
- **`src/infrastructure/adapters/mailer.ts`** — provides `missingSmtpCompanions` and `resolveMailTransport`, both wired into the `customChecks` array.
- **`src/infrastructure/adapters/logger.ts`** — provides `resolvePersonalFieldMode`, wired in the same way.
- **`src/infrastructure/observability/analytics/index.ts`** — provides `resolveAnalyticsProvider`, wired in the same way.
- **`tests/unit/app/required-config.test.ts`** — unit-tests the checks defined in this file.

## Notes

- This file is a **wiring layer only**. The actual probe logic for SMTP companions lives in `adapters/mailer.ts`; the selector resolvers live in their respective infrastructure modules. This file just calls them.
- Do **not** add checks here for `NODE_PAYMENT_PROVIDER` or `NODE_ANTIBOT_PROVIDER` — those are real modules with their own manifests and `customCheck` entries. Adding them here would duplicate the check and violate the kernel's naming rule in the opposite direction.
- `NODE_CORS_ORIGIN` is `productionOnly: true`; it is intentionally skipped in dev/test where the `http://localhost:8080` fallback in `app/security.ts` is acceptable.
- The file's header comment documents _why_ each check lives here rather than in a module manifest. Preserve that reasoning when adding or moving checks.
