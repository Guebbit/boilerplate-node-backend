# src/modules/orders/controllers/get-order-invoice.ts

## Purpose

Express controller handler for `GET /orders/:id/invoice`. It fetches an order (scoped to the caller's role), renders the shared EJS invoice template with localized copy, converts the HTML to a PDF via `renderHtmlToPdf`, and streams the PDF back as a download. It exists so the invoice can be generated on demand in the requesting user's locale, reusing the same template and copy logic as the email path.

## Key elements

- **`getOrderInvoice(request, response)`** – The sole export. Validates the `id` param, calls `orderService.getById` with the caller's scope, renders the EJS template at `shared/views/templates-files/orders.invoice.ejs` through `invoiceDocument(locale, order)`, pipes the HTML to `renderHtmlToPdf`, and sends the result with `Content-Type: application/pdf` and a `Content-Disposition` header naming the file `invoice-<orderId>.pdf`.

## Relationships

- **`src/modules/orders/service.ts`** – `orderService.getById(id, scope)` loads the order; `orderService.callerScope(authContext)` determines whether the caller sees a hydrated admin document or a transformed owner object.
- **`src/modules/orders/emails.ts`** – `invoiceDocument(locale, order)` produces the localized copy object passed into the EJS template, shared with the email worker so both paths render identical text.
- **`src/modules/orders/routes.ts`** – Registers this handler on the `GET /orders/:id/invoice` route.
- **`src/infrastructure/adapters/pdf.ts`** – `renderHtmlToPdf` performs the HTML → PDF conversion.
- **`src/infrastructure/http/controller.ts`** – `catchAs` wraps the promise chain to emit a generic 500 with a fixed message.
- **`src/infrastructure/http/request.ts`** – `isValidObjectId` guards the param before hitting the database.
- **`src/infrastructure/http/response.ts`** – `rejectResponse` sends structured 404 errors.
- **`src/infrastructure/i18n/index.ts`** – `getDefaultLocale` supplies a fallback when the request carries no locale.
- **`src/infrastructure/i18n/catalog.ts`** – `t('orders.not-found')` provides the translated 404 message.

## Notes

- **`id` vs `_id`**: `getById` is polymorphic — admins get a Mongoose document (with the virtual `id`), owners get a plain object where `_id` was stripped by the serializer but `id` was added by the transform. The handler reads `id` (with a `?? _id` fallback) rather than `_id`, because reading `_id` on the owner branch would yield the literal string `"undefined"` in the filename and the document title.
- **Images / external links in the PDF**: They will not render. Any embedded images must be pre-converted to base64 before the template is filled.
- **Template location**: Lives at `shared/views/templates-files/orders.invoice.ejs` (project-relative), not inside the orders module.
- **Locale resolution**: Copy is resolved *here* in the controller (and in `workers/pdf.worker.ts`) via `invoiceDocument(locale, order)`, so the EJS template itself contains no i18n calls — it only interpolates.
- **404 on invalid `id`**: Performed *before* the service call; the comment cross-references `get-order-item.ts` for why the check is ordered ahead of the query (the two role branches raise different error classes).
