# src/modules/products/controllers/write-products.ts

## Purpose

Single controller handler for the three product write endpoints (`POST /products`, `PUT /products`, `PUT /products/:id`). It parses the request (including multipart uploads), validates the payload via the product service, then delegates to `create` or `updateById` depending on whether an id is present. It also owns the lifecycle of an uploaded image file: if validation or persistence fails, the file this request just stored is removed.

## Key elements

- **`writeProducts`** — the sole export. Accepts a generic Express `Request` whose body type is the union of all six product write request variants (JSON and multipart). Returns the HTTP response inline (no wrapper).
- **`readInput`** (from `@infrastructure/http/request`) — single declaration point for fields that need coercion from potentially-untyped multipart bodies: `id`, `active` (boolean), `price`/`onHand` (numbers), `categories`/`tags` (string arrays).
- **`resolveImageUrl`** (from `@infrastructure/http/uploads`) — extracts the uploaded-file URL; takes priority over a body-supplied `imageUrl`.
- **`productService.validateData` / `.create` / `.updateById`** (from `../service`) — validation and persistence.
- **`successResponse` / `rejectResponse` / `rejectDatabaseError`** (from `@infrastructure/http/response` and `errors`) — uniform response helpers.
- **`imageStore.remove`** (from `@infrastructure/adapters/image-store`) — cleans up the file uploaded by this request on any failure path.
- **`t`** (from `@infrastructure/i18n`) — localized error strings (used only for the missing-id PUT guard).
- **`callerContextOf`** (from `@infrastructure/http/request`) — derives the caller/audit context passed into service calls.

## Relationships

- **`src/modules/products/routes.ts`** — wires `writeProducts` as the handler for the three write routes.
- **`src/modules/products/service.ts`** — provides `validateData`, `create`, `updateById`; the controller is a thin HTTP adapter over this service.
- **`src/infrastructure/http/request.ts`** — supplies `readInput` (field coercion) and `callerContextOf` (audit context).
- **`src/infrastructure/http/uploads.ts`** — supplies `resolveImageUrl` to extract the uploaded file's URL from the request.
- **`src/infrastructure/adapters/image-store.ts`** — used only for `imageStore.remove` cleanup on failure paths.
- **`src/infrastructure/http/response.ts`** — `successResponse` / `rejectResponse` shape all outbound responses.
- **`src/infrastructure/http/errors.ts`** — `rejectDatabaseError` maps service-layer exceptions to a consistent 500 shape.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — provides `t()` for the one inline localized message.
- **`src/types/index.ts`** — source of the `CreateProductRequest*`, `UpdateProductRequest*`, `Product` type imports.

## Notes

- **`onHand` is create-only.** It is read from the request and passed to `productService.create`, but deliberately excluded from the update path. Stock changes on an existing product go through `POST /inventory/receipts` or `POST /inventory/adjustments`, which are signed, conditional, and ledger-backed. The `validated` object (shared by both paths) does not include `onHand`.
- **Multipart type gap.** Multipart bodies arrive as flat strings; `readInput` declares which fields need boolean/number/array coercion so `zodProductSchema` doesn't reject them.
- **Image cleanup scope.** `deleteUpload` removes only the file uploaded *by this request* (`imageUrlFile`), never a body-supplied `imageUrl`. This prevents a failed validation from destroying an image another request or user owns.
- **PUT without an id** returns 422 with a localized "missing data" message; it is treated as a protocol error, not a creation attempt.
- **Cleanup ordering.** On every failure path the code calls `deleteUpload().catch(() => undefined)` *before* sending the error response, so a transient storage outage doesn't escalate a 422 into a 500.
