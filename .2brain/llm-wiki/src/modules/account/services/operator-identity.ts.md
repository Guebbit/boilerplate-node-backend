---
source: src/modules/account/services/operator-identity.ts
sha256: cae6b9d7fee62e184cf3d6bd2d3e8e16af583fa65de88ef8a911b207a8463a4f
generated_at: 2026-11-08T04:19:42.991561+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/operator-identity.ts

## Purpose

Resolves the operator identity (legal name, address, VAT, contact) that a site is legally required to publish under e-Commerce Directive Art. 5(1) and GDPR Art. 13(1)(a). It reads live values from `accountConfig` and returns a fully-populated `Operator` object, ensuring required legal fields are always present. Lives in the `account` module rather than `shop` because operator identity exists even on sites without a shop.

## Key elements

- **`operatorIdentity()`** (exported) — Reads `accountConfig()`, validates required fields (`NODE_LEGAL_NAME`, `_STREET`, `_CITY`, `_ZIP`, `_COUNTRY`), includes optional fields (`_VAT_NUMBER`, `_TRADE_REGISTER`, `_REGISTRATION_NUMBER`, `_PHONE`) only when set, and returns an `Operator`. Email falls back to `supportEmail()` if `NODE_LEGAL_EMAIL` is unset.
- **`requiredValue(name, value)`** (internal) — Returns the value or throws `ConfigError` if `undefined`. The guard is a safety net for `NODE_ENV=test`, where the normal boot-time check is skipped.

## Relationships

- **`../config` (`src/modules/account/config.ts`)** — Provides `accountConfig()`, the sole data source for all identity fields.
- **`@infrastructure/adapters/config`** — Supplies `supportEmail()`, the fallback when `NODE_LEGAL_EMAIL` is not configured.
- **`@infrastructure/config/define`** — Supplies the `ConfigError` class thrown on missing required fields.
- **`@types`** — Defines the `Operator` return type.
- **`src/app/config-routes.ts`** — The `GET /config` endpoint that publishes the result to visitors.
- **`src/modules/invoicing/services/issue-invoice.ts`** / **`src/modules/orders/emails.ts`** — Consumers that embed the operator identity in invoices and order emails.
- **`src/modules/account/services/index.ts`** — Barrel re-export.
- **`src/modules/account/tests/unit/operator-identity.test.ts`** — Unit tests covering field presence/absence and error paths.

## Notes

- Required vs. optional is enforced here, not at config-parsing time. The distinction matters for legal compliance: name/street/city/zip/country must always appear on invoices and order emails.
- The `ConfigError` path is reachable only under `NODE_ENV=test` (where the production boot check is bypassed). In production a missing variable would have already failed earlier.
- Optional fields use spread-into-object (`...(x ? { key: x } : {})`) so the returned object omits them entirely rather than setting `undefined` values — important for serialization on `GET /config`.
- The module docstring explicitly states this is **not** a shop concern; do not move it into `src/modules/shop/`.
