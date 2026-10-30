---
source: src/modules/orders/tests/unit/config.test.ts
sha256: b49bd1f01f0da0e3a7288cd4d723ef440109ce63e69cc507c696905c40b01bf0
generated_at: 2026-10-29T04:58:28.554180+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/config.test.ts

## Purpose

Unit tests for the orders module's runtime configuration functions — shop identity, admin order-line limits, the frontend order-link template, the withdrawal-period gate, and PII retention knobs. The suite drives validation through `assertModuleConfig` rather than reading the manifest, because the wiring is itself half of what makes the check fire.

## Key elements

- **`IDENTITY` / `IDENTITY_VARIABLES`** — the six required shop-identity env vars (legal name, street, city, zip, email, phone) with one valid value each; `IDENTITY_VARIABLES` is the key list used to build `TOUCHED`.
- **`TOUCHED`** — every env var the file reads; passed to `withoutEnvironmentInThisFile` so each case starts clean and the file restores state on exit.
- **`configure()`** — sets a minimal valid deployment (`NODE_ENV=development`, URL, country, timezone, identity) so the boot gate can run.
- **`describe('the admin order limits')`** — asserts defaults (100 / 99 999), env override, contract-ceiling clamp against the Zod schema, and rejection of values < 1.
- **`describe('orderFrontendLink')`** — asserts the default template (`/en/orders/{id}`), the `NODE_FRONTEND_LINK_ORDER` override, and URL-encoding of the id.
- **`describe('the withdrawal period')`** — asserts default 30 days, boot rejection of 20 (below legal minimum + roll-over), and acceptance of 21 via `assertModuleConfig`.
- **`describe('the order PII claim window')`** — asserts `orderPiiDaysAfterGuarantee` defaults to 0 and `orderPiiDaysUndelivered` to 540, plus env override.

## Relationships

- **`src/kernel/module-config.ts`** — provides `assertModuleConfig`, which the withdrawal-period cases call to exercise the boot gate end-to-end.
- **`src/modules/orders/config.ts`** — source of every function under test (`maxAdminOrderLines`, `maxAdminOrderLineQuantity`, `orderFrontendLink`, `orderPiiDaysAfterGuarantee`, `orderPiiDaysUndelivered`, `withdrawalPeriodDays`).
- **`src/modules/orders/module.ts`** — exports `ordersModule`, passed as the module argument to `assertModuleConfig` so the gate sees the real wiring.
- **`tests/support/environment.ts`** — provides `withoutEnvironmentInThisFile` (per-file env isolation) and `setEnvironment` (per-case mutation).

## Notes

- **`NODE_ENV` must leave `test`** before any gate assertion; otherwise the config gate short-circuits and the suite silently asserts nothing. `configure()` handles this for gate cases; simpler cases set it explicitly.
- The "contract ceiling" test asserts that an env value *above* the Zod schema max does **not** widen the limit — the schema is the hard cap.
- `orderFrontendLink` tests imply the default base URL is `http://localhost:8080` (from `NODE_URL` default) and the template is `orders/{id}`; the override test confirms the template is relative to the locale segment.
