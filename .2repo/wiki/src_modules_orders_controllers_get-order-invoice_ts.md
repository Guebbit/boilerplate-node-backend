# src/modules/orders/controllers/get-order-invoice.ts

## Purpose

Handles `GET /orders/:id/invoice`. Resolves the order (with caller-scoped access), renders its localized copy into an EJS template, converts the resulting HTML to a PDF, and streams the file back as an attachment. The i18n strings are resolved *in the controller* rather than in the template so the identical render can be re-invoked from `adapters/pdf.worker.ts` where no request context exists.

## Key elements

- **`getOrderInvoice(request, response)`** – The sole export. Validates the route param, loads the order via `orderService.getById` scoped to the caller, renders the template, converts to PDF, and sends it with `Content-Disposition: attachment; filename="invoice-<id>.pdf"`.
- **`orderId` resolution** – Reads `order.id ?? order._id` to handle the polymorphic shape returned by `getById` (hydrated doc vs. transformed plain object). The cast documents that the wire carries `id` in both branches.

## Relationships

- **`src/modules/orders/routes.ts`** – Registers the `GET /orders/:id/invoice` route and passes it to this controller.
- **`src/modules/orders/service.ts`** – `orderService.getById(id, scope)` loads the order; `orderService.callerScope(authContext)` determines admin-vs-owner visibility.
- **`src/modules/orders/emails.ts`** – `invoiceDocument(locale, order)` produces the already-localized copy (line items, totals, labels) that the EJS template interpolates.
- **`src/infrastructure/adapters/pdf.ts`** – `renderHtmlToPdf(html)` performs the HTML→PDF conversion.
- **`src/infrastructure/http/controller.ts`** – `catchAs(response, msg)` normalises the promise rejection into an error response.
- **`src/infrastructure/http/request.ts`** – `isValidObjectId(param)` guards the route parameter before any DB query.
- **`src/infrastructure/http/response.ts`** – `rejectResponse(response, 404, msgs)` emits the 404 for a missing/invalid order.
- **`src/infrastructure/i18n/context.ts` / `catalog.ts`** – `getDefaultLocale()` and `t(key)` supply the locale fallback and the lookup used for the 404 message.

## Notes

- **Images and links do not render in the output PDF.** Any visual assets must be embedded as base64 data URIs in the template.
- **`id`, not `_id`.** `getById` is polymorphic: an admin receives a hydrated Mongoose document (no `id` virtual on the stored shape by convention), while an owner receives a plain object whose `_id` was deleted by the serializer. Reading `_id` unconditionally produced the literal string `"undefined"` in the filename and title for non-admin callers. The controller reads `order.id` first and falls back to `order._id`.
- **i18n is resolved before the template runs.** This is deliberate: the same `invoiceDocument(locale, order) → ejs.renderFile(…)` pipeline is reused by `adapters/pdf.worker.ts`, which has no `Request` to pull a locale from. Keeping resolution in the caller (controller or worker) keeps the template a pure interpolator.
- **404 is checked *before* the scope query.** An invalid ObjectID is rejected up front so the two role branches (admin vs. owner) never raise different error classes for the same bad input.
