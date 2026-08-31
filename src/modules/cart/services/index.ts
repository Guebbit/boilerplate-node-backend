/**
 * @module
 * Cart service — shopping cart operations, identified by userId.
 *
 * A folder rather than one file because it passed ~300 lines; see `docs/theory/layers.md`.
 *
 * | file          | what is in it                                             |
 * | ------------- | --------------------------------------------------------- |
 * | `view.ts`     | joining lines to products, and the contract's shape (internal) |
 * | `items.ts`    | reading a cart and changing what is in it                 |
 * | `checkout.ts` | turning a cart into an order, and the race that guards it |
 * | `reorder.ts`  | an old order refilling the cart                            |
 * | `cleanup.ts`  | tearing down carts when a user or product is deleted      |
 */

import {
    cartGet,
    cartGetForBadge,
    cartGetForView,
    cartItemSetById,
    cartItemAdd,
    cartItemUpdateQuantity,
    cartItemAddById,
    cartItemRemoveById,
    cartRemove
} from './items';
import { orderConfirm } from './checkout';
import { reorderIntoCart } from './reorder';
import { cartDeleteByUserId, productRemoveFromCartsById } from './cleanup';

/*
 * Published by name as well as through the namespace: `module.ts` wires the two cleanup calls into
 * the events that trigger them, and the unit suite drives the item operations directly. The line
 * types stay in `./view`, where the two files that name them already import from — a barrel line
 * for a type nobody asks the barrel for is a name to keep in step for no reader.
 */
export {
    cartGet,
    cartGetForBadge,
    cartGetForView,
    cartItemSetById,
    cartItemAdd,
    cartItemUpdateQuantity,
    cartItemAddById,
    cartItemRemoveById,
    cartRemove
} from './items';
export { orderConfirm } from './checkout';
export { cartDeleteByUserId, productRemoveFromCartsById } from './cleanup';

/** The module's barrel export — controllers and siblings call through this, never the bare functions. */
export const cartService = {
    cartGet,
    cartGetForBadge,
    cartGetForView,
    cartItemSetById,
    cartItemAdd,
    cartItemUpdateQuantity,
    cartItemAddById,
    cartItemRemoveById,
    cartRemove,
    cartDeleteByUserId,
    orderConfirm,
    reorderIntoCart,
    productRemoveFromCartsById
};
