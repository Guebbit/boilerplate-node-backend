# src/modules/products/controllers/get-product-item.ts

## Purpose

Express handler for `GET /products/:id`. Resolves a single product by path parameter, applying role-based visibility so that only admins can view inactive or deleted items. Delegates all data access to `productService` and normalises success / error responses.

## Key elements

- **`getProductItem(request, response)`** (exported) – The sole export. Reads `request.params.id`, calls `productService.getByIdViewed(id, callerScope, callerContext)`, then returns `200` with the product or `404` with a localised "not found" message.
- **`productService.callerScope(request.authContext)`** – Derives the visibility scope (active-only vs. all) from the authenticated user's role.
- **`callerContextOf(request)`** (from `@infrastructure/http/request`) – Extracts caller metadata forwarded to the service layer.
- **Error path** – Mongoose `CastError` on `ObjectId` kind → `404` (not `400`); any other error → `rejectDatabaseError`.

## Relationships

- **`src/modules/products/routes.ts`** – Wires `getProductItem` to the `GET /products/:id` route; must attach the `getAuth` middleware so `request.authContext` is populated before the handler runs.
- **`src/modules/products/service.ts`** – Provides `getByIdViewed` (data fetch + visibility filter) and `callerScope` (role → scope mapping).
- **`src/infrastructure/http/response.ts`** – `successResponse` / `rejectResponse` shape the JSON envelope.
- **`src/infrastructure/http/errors.ts`** – `rejectDatabaseError` produces a standardised 500 payload with a tag (`'getProductItem'`) for tracing.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** – `t('products.not-found')` localises the 404 message.
- **`src/infrastructure/http/request.ts`** – `callerContextOf` reads caller metadata off the request.

## Notes

- `request.authContext` is accessed directly with no guard; the **route** is responsible for running `getAuth`. If the route omits that middleware the handler will throw on `undefined`.
- Invalid `ObjectId` values are intentionally mapped to **404** (not 400) to avoid disclosing expected ID format.
- The handler is fire-and-forget: it uses `.then`/`.catch` and does **not** return the promise, so Express cannot catch async rejections. All error handling is explicit inside the chain.
