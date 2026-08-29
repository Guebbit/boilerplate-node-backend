# src/modules/orders/emails.ts

## Purpose

Builds the finished, language-resolved copy for the two customer-facing order documents: the confirmation email and the invoice PDF. Each function returns fully-interpolated strings (via i18n) so that the downstream renderer—mail queue or Puppeteer—never resolves a translation key.

## Key elements

- **`OrderLines`** (interface) — Minimal structural shape needed by both documents: an `items` array (`quantity`, `product.title`, `product.price`) and an optional `shippingCost`. Deliberately narrower than a full `OrderDocument` so tests can use a two-line fixture.
- **`InvoiceOrder`** (interface) — Extends `OrderLines` with an optional `id` field used for the invoice title. `id` (not `_id`) because the order may arrive hydrated or as a plain object depending on caller scope.
- **`orderConfirmEmail(locale, name, order)`** — Returns an `EmailContent` object (template `orders.order-confirm`) with a translated subject, greeting, per-line strings, a total computed by `orderTotal`, and a shared footer.
- **`invoiceDocument(locale, order)`** — Returns a plain `Record<string, unknown>` render context for the Puppeteer invoice (no envelope/subject). Per-line strings are built in a loop because the template interpolates per-item values.

## Relationships

- **`@infrastructure/adapters/mailer`** — Imports the `EmailContent` type; `orderConfirmEmail` returns that shape so the mail adapter can dispatch it directly.
- **`@infrastructure/i18n`** — Imports `translator`; both builders call it to resolve every copy string before returning.
- **`./domain`** (→ `domain/index.ts` → `domain/totals.ts`) — Imports `orderTotal` so the confirmation email quotes the same arithmetic the order domain uses, including shipping.
- **`orders/controllers/get-order-invoice.ts`** — Consumes `invoiceDocument` to obtain the render context it feeds to Puppeteer.
- **`orders/controllers/write-orders.ts`** — Consumes `orderConfirmEmail` to enqueue the confirmation after a new order is written.
- **`orders/index.ts`** — Re-exports the public API of this module.
- **`orders/tests/unit/invoice-locale.test.ts`** — Unit-tests the locale resolution and per-line interpolation in both builders.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — Verifies the EJS templates (`orders.order-confirm`, invoice) render correctly against the data shapes produced here.

## Notes

- The language is always a caller-supplied argument; nothing in this file reads a request or session. The output is final text—downstream renderers must not call a translator.
- `OrderLines.shippingCost` is optional: an order with no delivery method simply omits it, and `orderTotal` handles the absent field.
- The confirmation email's `total` is *not* a fresh sum; it delegates to `orderTotal(order)` so the number matches the order record exactly.
- Per-line copy is the one piece that must be resolved in a loop (interpolates `title`, `quantity`, `price` per item) and therefore cannot be collapsed into a single static string.
