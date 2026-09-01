# src/modules/orders/emails.ts

## Purpose

Resolves the copy for the two documents the orders module produces — the customer-facing confirmation email and the invoice PDF — into finished, locale-resolved strings. By the time the mailer queue or Puppeteer renders the template, no i18n key lookup remains. Follows the same "language is an argument, output is finished text" rule as `@modules/account/emails`.

## Key elements

- **`OrderLines`** (interface) — Minimal structural shape both documents need: `items` (quantity, product title/price) and an optional `shippingCost`. Intentionally narrower than a full `OrderDocument` so tests can supply a two-line fixture.
- **`orderConfirmEmail(locale, name, order)`** — Returns an `EmailContent` object (template name, subject, interpolated `data`) for the confirmation email. Each line is translated individually; the total uses `orderTotal(order)`.
- **`InvoiceOrder`** (interface) — Extends `OrderLines` with `id?: unknown` for the document title.
- **`invoiceDocument(locale, order)`** — Returns a plain `Record<string, unknown>` render context for the invoice PDF (no envelope/subject). Per-line strings are built in a loop for the same interpolation reason.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — Imports the `EmailContent` type; `orderConfirmEmail` returns this shape for the mailer queue to consume.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — Imports `translator` to resolve all keys at call time.
- **`src/modules/orders/domain/index.ts` → `domain/totals.ts`** — Imports `orderTotal` so the email's quoted total matches the domain's arithmetic (shipping included).
- **`src/modules/orders/service.ts`** — Calls `orderConfirmEmail` as part of the order-lifecycle flow.
- **`src/modules/orders/controllers/get-order-invoice.ts`** — Calls `invoiceDocument` to build the PDF render context.
- **`src/modules/orders/index.ts`** — Re-exports the public surface of this module.
- **`src/modules/cart/services/checkout.ts`** — Downstream caller that ultimately triggers the confirmation email path.
- **Tests** — `emails.test.ts`, `invoice-locale.test.ts`, and `mailer-templates.test.ts` exercise the builders and their templates.

## Notes

- **`id` vs `_id`:** `InvoiceOrder.id` is typed as `unknown` because the order arrives via `orderRepository.findByIdScoped`, whose shape depends on caller scope (admin → hydrated Mongoose doc with `_id`; owner → transformed plain object with `_id` already deleted). `id` is the field that resolves on both paths.
- **Per-line interpolation:** Each line string is translated individually inside a `.map()` because `orders.email-confirm.line` / `orders.invoice.line` interpolate per-item values (title, quantity, price). A single pre-resolved string is not possible.
- **Total source:** The confirmation email's total is `orderTotal(order)`, not a local re-sum. If the domain's total logic changes (tax, discounts, shipping), the email follows automatically.
- **Template responsibility:** The EJS templates (`orders.order-confirm`, `orders.invoice`) only interpolate; they never call a translator. All resolution happens in this file.
