# src/modules/cart/services/index.ts

## Purpose

Barrel file for the cart service folder. Re-exports the individual service functions (item CRUD, checkout, reorder, cleanup) both as named exports and as a single `cartService` namespace object, giving consumers a single import path for all cart operations. The folder exists in place of a single file because the service layer exceeded the project's ~300-line threshold (see `docs/theory/layers.md`).

## Key elements

- **Named re-exports from `./items`** — `cartGet`, `cartGetForBadge`, `cartGetForView`, `cartItemSetById`, `cartItemAdd`, `cartItemUpdateQuantity`, `cartItemAddById`, `cartItemRemoveById`, `cartRemove`.
- **`orderConfirm` (from `./checkout`)** — turns a cart into an order; includes a race guard.
- **`reorderIntoCart` (from `./reorder`)** — refills the cart from a prior order. Available only via the namespace, *not* re-exported by name.
- **`cartDeleteByUserId`, `productRemoveFromCartsById` (from `./cleanup`)** — tear down carts on user or product deletion.
- **`cartService`** — a plain object bundling every function above (including `reorderIntoCart`) under one key for consumers who prefer a namespace import.

## Relationships

- **`./items`, `./checkout`, `./reorder`, `./cleanup`** — the four sibling modules whose functions this file re-exports. `reorder.ts` is the only sibling not re-exported by name.
- **`./view`** — holds the shared line-type contracts; deliberately *not* re-exported here. Consumers that need those types import from `./view` directly (both `items.ts` and `checkout.ts` already do).
- **Cart controllers** (`get-cart`, `get-cart-summary`, `post-cart`, `post-checkout`, `post-reorder`, `put-cart-item`, `delete-cart`, `delete-cart-item`) — import the service functions through this barrel rather than reaching into individual files.
- **`module.ts`** — imports `cartDeleteByUserId` and `productRemoveFromCartsById` from this file and wires them into the lifecycle events (user-deleted, product-deleted) that trigger cleanup.
- **`src/modules/cart/index.ts`** — the module's public entry point; re-exports this service barrel (and controllers) outward.
- **`src/modules/account/tests/integration/addresses.test.ts`** — appears in the dependency graph as a consumer of the cart service functions (the doc comment notes that test suites drive item operations directly through these exports).

## Notes

- **Asymmetric export surface.** `reorderIntoCart` lives in `cartService` but is *not* in the named `export {…}` list. Code doing `import { reorderIntoCart } from '…/services'` will fail; use the namespace or import from `./reorder` directly.
- **Two export styles, one purpose.** The named exports serve tree-shakable ESM imports (controllers, tests); the `cartService` object serves the `module.ts` wiring that passes a single reference into event handlers. Keep both in sync when adding or removing a service function.
- **Types are intentionally absent.** Line/shape types belong to `./view` and are not re-exported here. Adding a type re-export to this barrel would create an extra name to keep in step with no reader benefit.
