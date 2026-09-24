/**
 * @module
 * Cart service — shopping cart operations, identified by userId. A folder rather than one file
 * because it passed ~300 lines; see `docs/theory/layers.md`. `view.ts` joins lines to products,
 * `items.ts` reads/writes the cart, `checkout.ts` turns it into an order, `reorder.ts` refills it
 * from an old order, and `cleanup.ts` tears down carts on user/product deletion.
 */

import * as items from './items';
import * as checkout from './checkout';
import * as reorder from './reorder';
import * as cleanup from './cleanup';

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
    cartGet: items.cartGet,
    cartGetForBadge: items.cartGetForBadge,
    cartGetForView: items.cartGetForView,
    cartItemSetById: items.cartItemSetById,
    cartItemAdd: items.cartItemAdd,
    cartItemUpdateQuantity: items.cartItemUpdateQuantity,
    cartItemAddById: items.cartItemAddById,
    cartItemRemoveById: items.cartItemRemoveById,
    cartRemove: items.cartRemove,
    cartDeleteByUserId: cleanup.cartDeleteByUserId,
    orderConfirm: checkout.orderConfirm,
    reorderIntoCart: reorder.reorderIntoCart,
    productRemoveFromCartsById: cleanup.productRemoveFromCartsById
};
