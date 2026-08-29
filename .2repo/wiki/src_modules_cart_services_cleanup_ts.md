# src/modules/cart/services/cleanup.ts

## Purpose

Cleanup entry points that **other** modules invoke when a user or product they own is deleted. A cart holds references to a user and a product but owns neither; without these functions, dangling references would persist in MongoDB. They are not reachable from any cart route — `module.ts` wires them to domain events that fire on user/product deletion.

## Key elements

- **`cartDeleteByUserId(userId: string): Promise<void>`** — Hard-deletes a user's entire cart document (account-deletion scenario). Thin pass-through to `cartRepository.deleteByUserId`. Returns no HTTP envelope.
- **`productRemoveFromCartsById(id: string): Promise<ResponseSuccess<undefined> | ResponseReject>`** — Removes a product from *every* user's cart. Returns a success envelope with `modifiedCount` in the message, or a `rejectDatabaseEnvelope('cart', …)` on failure.

## Relationships

- **`src/modules/cart/repository.ts`** — Both functions delegate all persistence to `cartRepository` (`deleteByUserId`, `removeProductFromAll`). This file contains no direct Mongoose calls.
- **`src/infrastructure/http/response.ts`** — Imports `generateSuccess`, `ResponseSuccess`, `ResponseReject` to shape the product-removal response.
- **`src/infrastructure/http/errors.ts`** — Imports `rejectDatabaseEnvelope` for the error path in `productRemoveFromCartsById`.
- **`src/modules/cart/module.ts`** — Wires both exports to the domain events emitted on user-deletion and product-deletion.
- **`src/modules/cart/services/index.ts`** — Re-exports these functions so they can be imported from the services barrel.
- **`src/modules/cart/tests/integration/service.test.ts`** — Exercises both functions in integration tests.

## Notes

- Asymmetry in return types: `cartDeleteByUserId` returns raw `Promise<void>` (caller handles HTTP), while `productRemoveFromCartsById` builds its own success/error envelope. Callers should not double-wrap the latter.
- The JSDoc explicitly contrasts `cartDeleteByUserId` (hard delete) with the route-level `cartRemove` (empties items, keeps the cart). Do not conflate them.
- The catch block in `productRemoveFromCartsById` types the error as `CastError | Error`; only the product-ID cast scenario is realistically expected, but the union guards against unexpected rejections.
