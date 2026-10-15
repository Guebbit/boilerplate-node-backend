---
source: src/modules/orders/tests/unit/withdrawal-notice.test.ts
sha256: 76f233416783c8f195362e1b2fa68881858441ede01d30a3b5372221abe1c7f6
generated_at: 2026-10-15T11:22:05.261108+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/withdrawal-notice.test.ts

## Purpose

Unit tests for the `withdrawalNotice` function and its integration into the placed-order emails. Verifies that the correct legal case (physical goods, digital, fully/partially excluded) is selected, that every EU-mandated placeholder (withdrawal period, shop identity, goods/return address, postage payer, online-function link, Annex I note 3) is filled with a concrete value, and that the rendered EJS output matches expectations in both English and Italian.

## Key elements

- **`line(title, flags)`** – helper that builds a single `OrderLines['items'][number]` with optional `requiresShipping` / `noWithdrawal` flags.
- **`GOODS` / `DIGITAL`** – two fixture `OrderLines` objects representing the primary test scenarios.
- **`textOf(notice)`** – joins `terms + effects + form` into one string for substring assertions.
- **`render(email)`** – renders a real `.ejs` template from `MODULES_ROOT/orders/templates/` rooted at `REPO_ROOT`, mimicking the production mailer.
- **`describe` blocks** –
  - *which case applies* – goods, digital, mixed, all-excluded, partially-excluded, no-exclusion.
  - *every placeholder is filled* – shop identity, configurable period (14 vs 21 days), goods/return address, postage payer, order-page link, Annex I(A) note 3 wording, i18n completeness, Italian heading.
  - *both placed-order emails carry the notice* – asserts `orderConfirmEmail` and `bankTransferInstructionsEmail` both embed the notice fields.
  - *the shared partial, rendered* – full EJS render checks (heading, form, exclusion-only output, HTML-escaping of shop name).

## Relationships

- **`src/modules/orders/emails.ts`** – imports `withdrawalNotice`, `orderConfirmEmail`, `bankTransferInstructionsEmail`, and the `OrderLines` type; all assertions target the return values of these functions.
- **`src/modules/orders/config.ts`** – imports `orderFrontendLink` to assert the order-page URL appears in the notice text.
- **`tests/support/environment.ts`** – imports `withEnvironmentOverrides` to run assertions under modified env vars (`NODE_WITHDRAWAL_PERIOD_DAYS`, `NODE_RETURN_ADDRESS_*`, `NODE_RETURN_POSTAGE_PAYER`, `NODE_SHOP_LEGAL_NAME`).
- **`tests/support/paths.ts`** – imports `REPO_ROOT` and `MODULES_ROOT` to locate the real EJS templates for the `render` helper.

## Notes

- Tests assert exact EU regulatory wording (CRD Art. 6(1)(h), 8(7), Annex I; Directive 2023/2673 note 3). Changing the template text will break assertions.
- The "no placeholder" sweep checks for `{{`, `orders.email-withdrawal` (i18n key prefix), and `^orders\.` in headings across **both locales and both order types**.
- The `render` helper reads templates from the actual filesystem relative to `REPO_ROOT`; running the test in a non-repo context will fail.
- The double-escape test (`Smith & Sons` → `Smith &amp; Sons`, not `&amp;amp;`) guards against a known EJS auto-escape pitfall.
