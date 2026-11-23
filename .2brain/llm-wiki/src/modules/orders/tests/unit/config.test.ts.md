---
source: src/modules/orders/tests/unit/config.test.ts
source_sha256: b60e7fc647712ce42ea6fff00b68d956fe9a60e34b4ce0d124f96e36658e04f2
context_sha256: 97bd9cf5087fa51a3e279666c08e6d1e426d7882b929f11021be3d932db9e6a1
generated_at: 2026-11-22T06:35:08.208003+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/unit/config.test.ts

## Purpose
Unit tests for the orders module's environment-driven configuration: admin order limits, the order frontend link and page path, the withdrawal period, and the order PII claim windows. Boot-time checks are exercised through `assertModuleConfig` with the real orders manifest, so the wiring that makes the check run is tested as well. All of this is pure env reads, so unit tests are enough.

## Key elements
- `IDENTITY` / `IDENTITY_VARIABLES` — valid values for the required shop-identity variables (`NODE_LEGAL_NAME`, `NODE_LEGAL_STREET`, `NODE_LEGAL_CITY`, `NODE_LEGAL_ZIP`, `NODE_LEGAL_PHONE`) and their key list.
- `TOUCHED` — every env variable the gate reads. It is passed to `withoutEnvironmentInThisFile` so they are cleared before each case and restored after the file.
- `configure()` — sets a deployment that passes every check (`NODE_ENV=development`, `NODE_URL`, `NODE_LEGAL_COUNTRY=IT`, `NODE_SHOP_TIMEZONE=Europe/Rome`, plus `IDENTITY`). A case then breaks one thing.
- `describe('the admin order limits')` — defaults are 100 lines and 99,999 units per line. `NODE_ADMIN_ORDER_MAX_LINES` and `NODE_ADMIN_ORDER_MAX_LINE_QUANTITY` override them. Values above the schema ceiling (`createOrderBodyItemsMax`, `createOrderBodyItemsItemQuantityMax`) are clamped to it. A limit below 1 throws.
- `describe('orderFrontendLink')` — builds `http://localhost:8080/en/orders/<id>` from the default template. `NODE_FRONTEND_LINK_ORDER` overrides the template, and the id is URL-encoded.
- `describe('orderPagePath')` — fills and encodes the id in the default template, and follows the override.
- `describe('the withdrawal period')` — defaults to 30. At boot, 20 is rejected with an error matching `NODE_WITHDRAWAL_PERIOD_DAYS`. 21 is accepted and read back.
- `describe('the order PII claim window')` — `orderPiiDaysAfterGuarantee` defaults to 0 and `orderPiiDaysUndelivered` to 540. Both are read from `NODE_ORDER_PII_DAYS_AFTER_GUARANTEE` and `NODE_ORDER_PII_DAYS_UNDELIVERED`.

## Relationships
- `src/kernel/module-config.ts` — provides `assertModuleConfig`, called as `assertModuleConfig([ordersModule], [])` for the boot-time withdrawal-period cases.
- `src/modules/orders/config.ts` — the code under test: `maxAdminOrderLines`, `maxAdminOrderLineQuantity`, `orderFrontendLink`, `orderPagePath`, `orderPiiDaysAfterGuarantee`, `orderPiiDaysUndelivered` and `withdrawalPeriodDays`.
- `src/modules/orders/module.ts` — the default export `ordersModule`, the manifest handed to `assertModuleConfig`.
- `tests/support/environment.ts` — imported as `@tests/environment`. It supplies `withoutEnvironmentInThisFile` and `setEnvironment` for env isolation and setup.

## Notes
- `configure()` sets `NODE_ENV` to `development` because the config gate short-circuits under `NODE_ENV=test`. Without that, boot-check cases would assert nothing.
- Cases that read config directly (limits, links, PII windows) do not call `configure()`. They rely on the cleared environment and the defaults.
- The default link host `http://localhost:8080` appears in the expected URLs. It is not set by the test, so it comes from the config default with `NODE_FRONTEND_URL` unset.
- The ceilings `createOrderBodyItemsMax` and `createOrderBodyItemsItemQuantityMax` are imported from `@api/schemas.zod`.
