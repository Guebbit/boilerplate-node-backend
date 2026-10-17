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

/** The module's barrel export — controllers and siblings call through this, never the bare functions. */
export const cartService = {
    get: items.cartGet,
    getForBadge: items.cartGetForBadge,
    getForView: items.cartGetForView,
    setItemById: items.cartItemSetById,
    addItem: items.cartItemAdd,
    updateItemQuantity: items.cartItemUpdateQuantity,
    addItemById: items.cartItemAddById,
    removeItemById: items.cartItemRemoveById,
    remove: items.cartRemove,
    setShippingMethod: items.cartShippingMethodSet,
    deleteByUserId: cleanup.cartDeleteByUserId,
    orderConfirm: checkout.orderConfirm,
    reorderIntoCart: reorder.reorderIntoCart,
    merge: merge.cartMerge,
    productAvailabilityFor: shelf.productAvailabilityFor,
    productRemoveFromCartsById: cleanup.productRemoveFromCartsById
};
