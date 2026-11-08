---
source: src/modules/orders/tests/unit/withdrawal-notice.test.ts
sha256: 667907f30bce3d65779079a7252af44050d28004c93b160f9612464ac8651a1a
generated_at: 2026-11-08T07:15:26.113032+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/withdrawal-notice.test.ts

## Purpose

Unit tests for the `withdrawalNotice` builder and its inclusion in the placed-order confirmation email. The file verifies that the statutory withdrawal text (CRD Art. 6(1)(h), 8(7), Annex I; Directive 2023/2673) is selected correctly for goods, digital, mixed, and fully-excluded baskets; that every placeholder the official text leaves open (period, shop identity, goods/return address, postage payer) is filled; and that the rendered EJS partial displays the notice and model form without double-escaping or leftover template keys.

## Key elements

- **`line(title, flags)`** — factory for a single `OrderLines` item; the `requiresShipping` and `noWithdrawal` flags drive the three-case logic.
- **`GOODS` / `DIGITAL`** — minimal fixture orders (physical "Dog Bed" vs. digital "E-book") used throughout.
- **`textOf(notice)`** — flattens `terms + effects + form` into one string so assertions can do locale-independent substring checks without caring which row holds the text.
- **`render(email)`** — loads and renders the real `.ejs` template from `modules/orders/templates/` rooted at `REPO_ROOT`, mirroring the production mailer path.
- **`describe("withdrawalNotice: which case applies")`** — five cases: goods clock, digital clock, mixed (goods wins), all-excluded (single sentence, no form), partially-excluded (named items + form remains).
- **`describe("withdrawalNotice: every placeholder is filled")`** — shop identity, configurable withdrawal period vs. fixed 14-day refund, default vs. configured return address, consumer-vs.-shop postage, `orderFrontendLink` presence, Annex I(A) note-3 acknowledgement wording (en + it), no stray `{{` or i18n keys.
- **`describe("the placed-order email carries the notice")`** — asserts `orderConfirmEmail().data.withdrawal` equals the `withdrawalNotice` result.
- **`describe("the shared partial, rendered")`** — end-to-end template render checks: heading, model form, exclusion-only variant, and single-pass HTML escaping of the legal name.

## Relationships

- **`src/modules/orders/emails.ts`** — source of `orderConfirmEmail`, `withdrawalNotice`, and the `OrderLines` type under test.
- **`src/modules/orders/config.ts`** — provides `orderFrontendLink`, whose output is asserted as a substring of the notice text.
- **`tests/support/environment.ts`** — `withEnvironmentOverrides` wraps tests that depend on `NODE_WITHDRAWAL_PERIOD_DAYS`, `NODE_RETURN_ADDRESS_*`, `NODE_RETURN_POSTAGE_PAYER`, and `NODE_LEGAL_NAME`.
- **`tests/support/paths.ts`** — `REPO_ROOT` and `MODULES_ROOT` resolve the EJS template location for `render`.

## Notes

- Tests that depend on environment configuration always use `withEnvironmentOverrides` rather than mutating `process.env` directly; the callback may be sync or return a `Promise`.
- The "no placeholder" test checks both `en` and `it` locales for both goods and digital baskets, and also verifies the heading isn't a raw i18n key (`orders.*`).
- HTML-escape test (`Smith & Sons`) guards against double-escaping: expects exactly `&amp;`, not `&amp;amp;`.
- The `textOf` helper is test-local; it does not exist in the production module.
