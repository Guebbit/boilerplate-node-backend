# src/modules/products/controllers/write-products.ts

## Purpose

Single admin controller handling product creation (POST /products) and update (PUT /products, PUT /products/:id). Both paths share validation, image bookkeeping, and upload-cleanup-on-failure logic, so they are consolidated into one handler that branches on the presence of an `id` in the request body.

## Key elements

- **`writeProducts`** (exported handler) — Reads typed input via `readInput`, reads the uploaded image via `readUploadedImage`, validates with `productService.validateData`, then dispatches to `productService.create` or `productService.updateById` depending on whether an `id` is present. Returns 201 on create, 200 on update, 422 on validation failure or missing id with PUT.
- **`readInput` call** — Declares `id`, `active` (boolean), `price`/`onHand` (numbers), and `categories`/`tags` (string arrays) so multipart bodies (which lose JS types) are coerced before reaching the zod schema.
- **`readUploadedImage` call** — Extracts `imageUrl`, `thumbnailUrl`, `pendingImageKey`, and the `deleteUpload` cleanup function from the request.
- **`validated` object** — Type-asserts the coerced fields as `Pick<Product, …> & { pendingImageKey?: string }`, since `pendingImageKey` is server-derived and not part of the `Product` type.
- **`openingCount`** — The `onHand` value, applied only on the create path. Deliberately excluded from `validated` so the update path never overwrites stock.

## Relationships

- **`src/modules/products/service.ts`** — Calls `productService.validateData`, `.create`, and `.updateById`; the controller is a thin transport layer over the service.
- **`src/modules/products/routes.ts`** — Registers `writeProducts` as the handler for the POST/PUT product routes.
- **`src/infrastructure/http/request.ts`** — Provides `readInput` (typed field extraction) and `callerContextOf` (extracts caller/auth context passed to the service).
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` and `rejectResponse` for uniform JSON replies.
- **`src/infrastructure/http/errors.ts`** — Provides `rejectDatabaseError` for mapping service-level DB failures to HTTP responses.
- **`src/infrastructure/adapters/image-store.ts`** — Provides `readUploadedImage` (parses multipart image, returns metadata + `deleteUpload`) and the `deleteUpload` function used to clean up orphaned uploads on any failure path.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — Supplies the `t` translation function used in the 422 "missing data" message.
- **`src/types/index.ts`** — Source of `CreateProductRequest`, `UpdateProductRequest`, `Product`, and related multipart type definitions.

## Notes

- **`onHand` is create-only by design.** The update contract intentionally omits the stock counter; modifying existing inventory must go through the signed/ledgered `POST /inventory/receipts` or `/adjustments` endpoints to avoid clobbering counts changed by sales.
- **`price` and `active` are declared in `readInput`** not because the JSON path needs coercion, but because the multipart image-upload variants of the same route deliver them as raw strings, which the downstream zod schema would reject.
- **Upload cleanup is fire-and-forget on validation failure.** `deleteUpload().catch(() => undefined)` ensures a transient storage error cannot escalate a client-side 422 into a server 500.
- **PUT without an `id` is a 422** (not 404 or 405), treated as a malformed request rather than a routing error.
- The file references `docs/theory/request-input.md` for the rationale behind the single-declaration `readInput` pattern.
