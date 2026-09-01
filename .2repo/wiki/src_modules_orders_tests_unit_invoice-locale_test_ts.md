# src/modules/orders/tests/unit/invoice-locale.test.ts

## Purpose

Verifies that the invoice PDF pipeline renders copy in the locale it was produced in, independent of any ambient locale scope. It covers two units: the generic PDF worker (which only interpolates pre-resolved strings from `invoiceDocument`) and the `upload.single` middleware chain (which re-enters the request locale after multer consumes the stream). The test lives under `modules/orders` rather than under the infrastructure worker because the scenario is orders-specific and should disappear with the module.

## Key elements

- **`escaped(value)`** — Local helper that applies the same HTML-entity escaping EJS `<%= %>` performs, so assertions can match rendered output directly.
- **`renderHtmlToPdfMock` / `renderedHtml()`** — Jest mock for `@infrastructure/adapters/pdf`; `renderedHtml()` extracts the HTML string passed to the mocked renderer for inspection.
- **`invoiceJob(locale)`** — Builds a job envelope via `invoiceDocument(locale, …)` from `../../emails`, simulating what a producer publishes (no locale field on the envelope itself).
- **`runMiddleware(middleware, request)`** — Invokes an Express middleware outside any `runWithLocale` scope and captures the locale the next handler observes.
- **`describe('the PDF worker renders the copy it was given')`** — Asserts Italian/English rendering, owner-shaped `id` (not `_id`) in the title, ambient-locale independence, malformed-job rejection, and that a render failure *rejects* (retry) rather than resolves `false` (dead-letter).
- **`describe('upload.single restores the locale')`** — Asserts the full 3-handler chain is returned, that the first handler re-enters the negotiated locale, and that it is a no-op when no locale was set.

## Relationships

- **`src/modules/orders/emails.ts`** — Source of `invoiceDocument`, which resolves all locale-specific copy into plain strings before the worker sees them. The test feeds its output into the worker and asserts the strings appear verbatim (escaped) in the rendered HTML.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — Provides `runWithLocale` (used to set an ambient scope the worker must ignore) and `getLocaleContext` (used in `runMiddleware` to read the locale the upload chain restored).
- **`tests/support/stub.ts`** — `asStub<Request>(…)` creates minimally-typed Express `Request` objects for the upload-middleware tests without a real HTTP server.

## Notes

- The test deliberately uses **owner-shaped** order data (`id` only, no `_id`). The docblock explains that `applyOrderTransform` strips `_id` after writing `id`; an admin's unscoped read keeps both, and reading `_id` would render the literal string `"undefined"` for owner downloads.
- EJS templates use `<%= %>` (escaped) on purpose for user-supplied product titles; the test mirrors that escaping rather than requesting a switch to `<%- %>`.
- Dynamic `await import(…)` is used for `@infrastructure/adapters/pdf.worker` and `@infrastructure/adapters/storage` so the module-level `jest.mock` on `@infrastructure/adapters/pdf` is in effect before those modules load.
- The upload tests assert **three** handlers in the chain (locale-restoring, content-type guard, image-store commit) to prevent a partial mount that would accept non-image bytes or stage files without a pointer.
