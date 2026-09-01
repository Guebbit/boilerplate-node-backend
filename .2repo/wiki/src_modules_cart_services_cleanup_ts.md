# src/modules/cart/services/cleanup.ts

## Purpose

Provides two cross-module cleanup entry points that remove cart references when a user or product is permanently deleted elsewhere in the system. Neither function is reachable from a cart route; they exist as the only callers that tidy up cart data after the owning entity disappears.

## Key elements

- **`cartDeleteByUserId(userId: string): Promise<void>`** — Hard-deletes a user's entire cart (the cart no longer lives inside the user document). Delegates to `cartRepository.deleteByUserId`.
- **`productRemoveFromCartsById(id: string): Promise<ResponseSuccess<undefined> | ResponseReject>`** — Removes a product from every user's cart. Delegates to `cartRepository.removeProductFromAll`, then wraps the result in a 200 success response reporting how many carts were modified, or a standard reject envelope on failure.

## Relationships

- **`src/modules/cart/module.ts`** — Wires both functions to the domain events that fire on user/product deletion, making them the actual invocation targets.
- **`src/modules/cart/repository.ts`** — Source of `cartRepository`, whose `deleteByUserId` and `removeProductFromAll` methods do the actual data work.
- **`src/infrastructure/http/response.ts`** — Supplies `generateSuccess` and the `ResponseSuccess` / `ResponseReject` types used to shape the HTTP-level return value.
- **`src/infrastructure/http/errors.ts`** — Supplies `rejectDatabaseEnvelope('cart', error)` for the error path.
- **`src/modules/cart/services/index.ts`** — Re-exports these functions so other modules can import them from the services barrel.
- **`src/modules/cart/tests/integration/service.test.ts`** — Integration tests that exercise these two functions end-to-end.

## Notes

- The module doc explicitly states these functions are **not** called from cart routes. Treating them as internal-to-cart would miss their cross-module contract.
- `cartDeleteByUserId` returns `Promise<void>` (fire-and-forget style), while `productRemoveFromCartsById` returns a full response envelope. Callers must handle the two shapes differently.
- The `CastError` type is imported from Mongoose but only used as a union member in the `.catch` signature; the handler delegates all error formatting to `rejectDatabaseEnvelope`.
