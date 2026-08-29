# src/modules/orders/tests/unit/invoice-locale.test.ts

## Purpose

Verifies two locale-related invariants of the order-invoice pipeline: (1) the generic PDF worker renders only the copy it was handed at production time and never re-resolves locale at render time, and (2) every multer upload method re-enters the request locale after the stream is consumed. The test lives here (in the orders module) rather than in the PDF-worker module so that deleting `orders` removes the template, its dictionaries, and this spec together.

## Key elements

- **`escaped(value)`** — HTML-escapes a string to match EJS `<%= %>` output (apostrophes → `&#39;`, etc.) so expectations align with rendered HTML.
- **`renderHtmlToPdfMock` / `renderedHtml()`** — Mock of `@infrastructure/adapters/pdf#renderHtmlToPdf`; `renderedHtml()` extracts the HTML string the mock received, used as the assertion surface.
- **`invoiceJob(locale?)`** — Builds a job envelope whose `templateData` is pre-resolved by `invoiceDocument(locale, order)`. Deliberately shaped as an *owner-scoped* read (plain `id`, no `_id`).
- **`runMiddleware(middleware, request)`** — Invokes an express middleware outside any locale scope (the state multer leaves the chain in) and returns whatever `getLocaleContext()` reports after the call.
- **`describe('the PDF worker renders the copy it was given')`** — Asserts Italian/English copy appears in the rendered HTML, that an ambient `runWithLocale('en')` scope does *not* override an Italian job, that the order id (not `undefined`) is interpolated into the title, that malformed jobs are discarded, and that a render failure rejects (for retry) rather than resolving `false`.
- **`describe('every upload method restores the locale')`** — Iterates over all five multer methods (`single`, `array`, `fields`, `none`, `any`), asserting each returns a 3-handler chain and that the first handler re-enters the negotiated locale; also confirms the chain is a no-op when no locale was set.

## Relationships

- **`src/infrastructure/i18n/context.ts`** — Source of `runWithLocale` and `getLocaleContext`, imported via the i18n barrel; used in the ambient-locale test and inside `runMiddleware` to observe the locale after a middleware call.
- **`src/infrastructure/i18n/index.ts`** — The barrel export path through which `runWithLocale` / `getLocaleContext` are imported.
- **`src/modules/orders/emails.ts`** — Provides `invoiceDocument`, which resolves the locale dictionary into concrete template data *before* the worker sees it; the test asserts the worker only interpolates that pre-resolved data.
- **`tests/support/stub.ts`** — Provides `asStub<Request>(…)` used to cast a plain object into the `Request` type for the upload-middleware tests.

## Notes

- Expectations are pre-escaped via `escaped()` because the templates intentionally use `<%= %>` (auto-escaping user-supplied product titles). Do not "fix" expectations to un-escaped strings or loosen templates to `<%- %>`.
- The `invoiceJob` helper's order shape (no `_id`) is a deliberate regression guard: an admin's hydrated-document shape carries both `id` and `_id`, so a read of `_id` passes for admins but interpolates the literal string `"undefined"` for owner-scoped reads. The assertion `.not.toContain('undefined')` is the only check that catches this.
- The ambient-locale test (`runWithLocale('en', …)` wrapping an Italian job) exists to prove the worker never consults a dictionary at render time; if a future refactor adds locale lookup inside the worker, this test will be the one to fail.
- The upload-chain tests use `it.each` over a const tuple of method names; `fields` requires an argument (`[]`) while the others are zero-arg — the helper handles both.
