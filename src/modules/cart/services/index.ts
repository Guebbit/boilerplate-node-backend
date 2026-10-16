/**
 * @module
 * Cart service — shopping cart operations, identified by userId. One file per flow, not one
 * big file; see `docs/theory/layers.md`.
 */

import * as items from './items';
import * as checkout from './checkout';
import * as reorder from './reorder';
import * as merge from './merge';
import * as cleanup from './cleanup';
import * as shelf from './shelf';

export type { CheckoutChoices } from './checkout';
export type { MergeResult } from './merge';
export { cartItemSetById } from './items';
export { orderConfirm } from './checkout';

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
    cartShippingMethodSet: items.cartShippingMethodSet,
    cartDeleteByUserId: cleanup.cartDeleteByUserId,
    orderConfirm: checkout.orderConfirm,
    reorderIntoCart: reorder.reorderIntoCart,
    cartMerge: merge.cartMerge,
    productAvailabilityFor: shelf.productAvailabilityFor,
    productRemoveFromCartsById: cleanup.productRemoveFromCartsById
};
