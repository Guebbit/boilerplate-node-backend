---
source: src/modules/orders/tests/unit/withdrawal-notice.test.ts
sha256: e369fa4dacf808b13ed994dcd81f046e0bff554c7495f2b5a61ac1cc44f9d02e
generated_at: 2026-10-29T05:01:14.852197+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/withdrawal-notice.test.ts

## Purpose

Unit tests for the `withdrawalNotice` builder and its integration into the placed-order confirmation email. Verifies the three CRD cases (physical goods, digital, mixed / all-excluded), that every statutory placeholder (period, shop identity, return address, postage payer) is resolved from environment or defaults, and that the shared EJS partial renders correctly in both `en` and `it`.

## Key elements

- **`line(title, flags)`** – factory that builds a single `OrderLines['items'][number]` entry; the `requiresShipping` and `noWithdrawal` flags drive case selection.
- **`GOODS` / `DIGITAL`** – two-line and one-line fixture baskets used across all suites.
- **`textOf(notice)`** – flattens `terms`, `effects`, and `form` into one string for substring assertions.
- **`render(email)`** – calls `ejs.renderFile` against the real `.ejs` template under `orders/templates/`, rooted at `REPO_ROOT`, mimicking the production mailer.
- **`describe('withdrawalNotice: which case applies')`** – asserts the correct statutory clock (receipt vs. contract), presence/absence of return-instruction paragraphs, and the "some excluded" naming of `noWithdrawal` items.
- **`describe('withdrawalNotice: every placeholder is filled')`** – checks shop identity, configurable withdrawal period (`NODE_WITHDRAWAL_PERIOD_DAYS`), return address fallback vs. override, postage-payer wording, order-page link, the Annex I(A) note-3 acknowledgement (post-Directive 2023/2673), and absence of unfilled `{{…}}` or `orders.email-withdrawal.*` i18n keys in both locales.
- **`describe('the placed-order email carries the notice')`** – asserts `orderConfirmEmail` embeds the exact `withdrawalNotice` object.
- **`describe('the shared partial, rendered')`** – renders the actual EJS template and checks HTML output (heading, form, exclusion-only case, single HTML-escaping of shop name).

## Relationships

- **`src/modules/orders/emails.ts`** – primary SUT; provides `withdrawalNotice`, `orderConfirmEmail`, and the `OrderLines` type under test.
- **`src/modules/orders/config.ts`** – supplies `orderFrontendLink`, verified as the URL embedded in the notice's online-withdrawal paragraph.
- **`tests/support/environment.ts`** – `withEnvironmentOverrides` is used to simulate `NODE_WITHDRAWAL_PERIOD_DAYS`, `NODE_RETURN_ADDRESS_*`, `NODE_RETURN_POSTAGE_PAYER`, and `NODE_SHOP_LEGAL_NAME` without mutating the real process env.
- **`tests/support/paths.ts`** – exports `REPO_ROOT` and `MODULES_ROOT` so the template renderer locates `orders/templates/*.ejs` regardless of the working directory.

## Notes

- The "some excluded" test expects a hard-coded English sentence (`"No right of withdrawal: Custom mug and Sealed soap."`); if i18n is extracted, the assertion must be updated in lockstep.
- The Annex I(A) note-3 assertions explicitly guard against the *old* phrasing ("electronically fill in" / "compilare e inviare elettronicamente") to catch regressions from the pre-2023/2673 template.
- `render()` reads from the filesystem at test time; the templates directory must exist relative to `MODULES_ROOT`, and the EJS `root` option prevents path-traversal surprises.
- The HTML-escaping test (`Smith & Sons` → `Smith &amp; Sons`, not `&amp;amp;`) guards against double-escaping in the EJS partial.
