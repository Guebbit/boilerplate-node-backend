---
source: src/modules/account/services/operator-identity.ts
source_sha256: 5655463a0879cbe80ca313124101f6f83bce980b5f13696fcebcb1ae4398f490
context_sha256: 72660f9634b7a80979462752c840fde505afc5975de0a8efdab47d0d05626f50
generated_at: 2026-11-22T03:38:52.128195+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/services/operator-identity.ts

## Purpose
Builds the site operator's legal identity (provider identification a visitor is entitled to under e-Commerce Directive Art. 5(1) and GDPR Art. 13(1)(a)) from the live `accountConfig` slice. It lives in `account`, not `shop`, because a site without the shop still has an operator. `GET /config` publishes the result, and `invoicing` and `orders` print it.

## Key elements
- `operatorIdentity(): Operator` — the only export. Reads `accountConfig()` on each call and returns an `Operator` object:
  - Required fields: `legalName`, `street`, `city`, `zip`, `country`, taken from `NODE_LEGAL_NAME`, `NODE_LEGAL_STREET`, `NODE_LEGAL_CITY`, `NODE_LEGAL_ZIP` and `NODE_LEGAL_COUNTRY`.
  - Optional fields, included only when set: `vatNumber`, `tradeRegister`, `registrationNumber`, `phone`.
  - `email` is `NODE_LEGAL_EMAIL`, falling back to `supportEmail()`.
- `requiredValue(name, value)` — private helper. Throws `ConfigError("Invalid configuration (account): <name> is required")` when the value is `undefined`.

## Relationships
- **`src/modules/account/config.ts` (`accountConfig`)**: source of all `NODE_LEGAL_*` values.
- **`src/infrastructure/adapters/config.ts` (`supportEmail`)**: fallback for `email`.
- **`src/infrastructure/config/define.ts` (`ConfigError`)**: error type thrown for a missing required value.
- **`src/types/index.ts` (`Operator`)**: return type.
- **Consumers**: `GET /config` (via `src/app/config-routes.ts`), `src/modules/invoicing/services/issue-invoice.ts`, `src/modules/orders/emails.ts` and `src/modules/shop/service.ts`.
- **`src/modules/account/services/index.ts`**: the services barrel for the account module.
- **Tests**: `src/modules/account/tests/unit/operator-identity.test.ts` and `src/modules/shop/tests/unit/config.test.ts`.

## Notes
- Under `NODE_ENV=test` the boot-time config check is skipped, so a required variable may be unset. `requiredValue` then throws a `ConfigError` rather than leaving `undefined` in a legal notice. Outside tests the boot check is expected to catch this earlier.
- Optional fields are checked for truthiness, so an empty string is omitted as well as `undefined`. Required fields are checked only for `undefined`, so an empty string passes.
- Nothing is cached; the identity is recomputed on every call.
