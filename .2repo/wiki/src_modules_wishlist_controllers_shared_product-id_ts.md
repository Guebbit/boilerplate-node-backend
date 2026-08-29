# src/modules/wishlist/controllers/shared/product-id.ts

## Purpose

Single shared guard that the three wishlist writing controllers (`POST /wishlist`, `DELETE /wishlist/:productId`, `POST /wishlist/:productId/move-to-cart`) all call to reject a non-ObjectId `productId` with a 422 response before any service logic runs. Extracted to eliminate three byte-identical validation branches and their comments living in separate files.

## Key elements

- **`malformedProductId(response, productId): boolean`** — the sole export. Validates `productId` against MongoDB's ObjectId shape via `isValidObjectId`. On failure it sends `422` with the i18n key `generic.error-missing-data` (through `rejectResponse`) and returns `true`; on success it returns `false` and leaves the response untouched. Call-site contract: `if (malformedProductId(res, id)) return;`

## Relationships

- **`@infrastructure/http/request`** — provides `isValidObjectId`, the shape-check this function delegates to.
- **`@infrastructure/http/response`** — provides `rejectResponse`, used to emit the 422 body.
- **`@infrastructure/i18n`** (barrel → `context.ts`) — provides the `t` translation helper for the error message.
- **`delete-wishlist-item.ts`**, **`post-move-to-cart.ts`**, **`post-wishlist.ts`** — the three controllers that import and call `malformedProductId` as their first guard; each stops immediately when it returns `true`.

## Notes

- **422, not 404, is deliberate.** A malformed id means the request is syntactically well-formed but carries an unusable value; 404 is reserved for "valid id, not in your wishlist." This lets clients distinguish a stale view from a client-side bug.
- **Does not use `extractAndValidateId`.** That helper (also in `@infrastructure/http/request`) resolves a field literally named `id`; wishlist routes name the parameter `productId` (path or body), so the existing helper would not find it. The contract (respond-then-stop) is intentionally the same.
- **`productId` is typed `string | undefined`.** `isValidObjectId` handles `undefined` safely (returns `false`), so the guard also covers the "field was omitted" case with the same 422.
- The `Id` type in the domain contract is a plain string (a backend could use ULIDs); the 24-hex-ObjectId check is a fact about this deployment's store, which is why the check lives at the controller boundary rather than in the service layer.
