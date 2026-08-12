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
 * | `cleanup.ts`  | tearing down carts when a user or product is deleted      |
 */

export type { ICartLine, ICartView } from './view';

export {
    cartGet,
    cartGetWithSummary,
    cartItemSetById,
    cartItemSet,
    cartItemAddById,
    cartItemAdd,
    cartItemRemoveById,
    cartItemRemove,
    cartRemove
} from './items';

export { orderConfirm } from './checkout';
export { cartDeleteByUserId, productRemoveFromCartsById } from './cleanup';

import {
    cartGet,
    cartGetWithSummary,
    cartItemSetById,
    cartItemSet,
    cartItemAddById,
    cartItemAdd,
    cartItemRemoveById,
    cartItemRemove,
    cartRemove
} from './items';
import { orderConfirm } from './checkout';
import { cartDeleteByUserId, productRemoveFromCartsById } from './cleanup';

export const cartService = {
    cartGet,
    cartGetWithSummary,
    cartItemSetById,
    cartItemSet,
    cartItemAddById,
    cartItemAdd,
    cartItemRemoveById,
    cartItemRemove,
    cartRemove,
    cartDeleteByUserId,
    orderConfirm,
    productRemoveFromCartsById
};
