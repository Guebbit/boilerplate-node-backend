/**
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

export type { ICartLine, ICartView } from './view';

export {
    cartGet,
    cartGetWithSummary,
    cartItemSetById,
    cartItemAddById,
    cartItemRemoveById,
    cartRemove
} from './items';

export { orderConfirm } from './checkout';
export { reorderIntoCart } from './reorder';
export { cartDeleteByUserId, productRemoveFromCartsById } from './cleanup';

import {
    cartGet,
    cartGetWithSummary,
    cartItemSetById,
    cartItemAddById,
    cartItemRemoveById,
    cartRemove
} from './items';
import { orderConfirm } from './checkout';
import { reorderIntoCart } from './reorder';
import { cartDeleteByUserId, productRemoveFromCartsById } from './cleanup';

export const cartService = {
    cartGet,
    cartGetWithSummary,
    cartItemSetById,
    cartItemAddById,
    cartItemRemoveById,
    cartRemove,
    cartDeleteByUserId,
    orderConfirm,
    reorderIntoCart,
    productRemoveFromCartsById
};
