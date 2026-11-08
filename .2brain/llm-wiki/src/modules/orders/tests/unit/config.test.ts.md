---
source: src/modules/orders/tests/unit/config.test.ts
sha256: b60e7fc647712ce42ea6fff00b68d956fe9a60e34b4ce0d124f96e36658e04f2
generated_at: 2026-11-08T07:11:31.954013+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/config.test.ts

## Purpose

Unit tests for the orders module's environment-driven configuration functions (admin order limits, frontend link templates, withdrawal period, PII retention windows). The file exists to pin down default values, env-var overrides, validation boundaries, and the boot-time gate that `assertModuleConfig` runs against a valid/invalid deployment — ensuring the wiring is exercised, not just the pure reads.

## Key elements

- **`IDENTITY` / `IDENTITY_VARIABLES`** – Fixed legal-name/street/city/zip/phone values and their env-var names, used by the shared `configure()` helper.
- **`TOUCHED`** – Complete list of env vars the gate reads; passed to `withoutEnvironmentInThisFile` so every var is cleared before each case and restored after the file.
- **`configure()`** – Sets `NODE_ENV=development`, `NODE_URL`, `NODE_LEGAL_COUNTRY`, `NODE_SHOP_TIMEZONE`, and the full `IDENTITY` block so that `assertModuleConfig` has a valid baseline to break one thing in.
- **`describe('the admin order limits')`** – Covers `maxAdminOrderLines` / `maxAdminOrderLineQuantity`: defaults (100 / 99 999), env overrides, ceiling enforcement via `createOrderBodyItemsMax` / `createOrderBodyItemsItemQuantityMax` from `@api/schemas.zod`, and rejection of values < 1.
- **`describe('orderFrontendLink')`** – Verifies the default template (`/en/orders/{id}`), the `NODE_FRONTEND_LINK_ORDER` override, and URL-encoding of the id.
- **`describe('orderPagePath')`** – Same template/override logic but returns the bare path (no host).
- **`describe('the withdrawal period')`** – Default of 30 days; `assertModuleConfig` rejects `NODE_WITHDRAWAL_PERIOD_DAYS=20` and accepts `21`, reading back via `withdrawalPeriodDays()`.
- **`describe('the order PII claim window')`** – `orderPiiDaysAfterGuarantee` (default 0) and `orderPiiDaysUndelivered` (default 540), plus env-var overrides.

## Relationships

- **`src/kernel/module-config.ts`** – Provides `assertModuleConfig`, the boot-time validation gate that the withdrawal-period tests drive. Tests call it with `[ordersModule]` to trigger the full gate rather than reading the manifest directly.
- **`src/modules/orders/config.ts`** – Source of every function under test (`maxAdminOrderLines`, `maxAdminOrderLineQuantity`, `orderFrontendLink`, `orderPagePath`, `orderPiiDaysAfterGuarantee`, `orderPiiDaysUndelivered`, `withdrawalPeriodDays`).
- **`src/modules/orders/module.ts`** – Imported as `ordersModule` and passed to `assertModuleConfig` so the gate evaluates the real module manifest.
- **`tests/support/environment.ts`** – Provides `withoutEnvironmentInThisFile` (bulk env cleanup) and `setEnvironment` (per-case env mutation) used throughout.

## Notes

- **`NODE_ENV` gate**: Every test that touches the boot-time gate must set `NODE_ENV` away from `test` first; otherwise `assertModuleConfig` short-circuits and the suite silently asserts nothing. The file-level doc comment calls this out explicitly.
- **Ceiling is the Zod schema, not env**: An env value above `createOrderBodyItemsMax` / `createOrderBodyItemsItemQuantityMax` is clamped, not honoured — the schema is the contract ceiling.
- **`withoutEnvironmentInThisFile` is file-scoped, not case-scoped**: All vars in `TOUCHED` are wiped after the file finishes, not after each test. Individual cases rely on `setEnvironment` to layer their own values on top.
