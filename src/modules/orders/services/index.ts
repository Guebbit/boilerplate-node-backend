/**
 * @module
 * Order service — all business logic for the Order entity, and the one place a controller may call
 * into. A folder rather than one file because it passed ~300 lines; see `docs/theory/layers.md`.
 *
 * `place.ts` is the one function that writes a new order; `crud.ts` reads and amends one, and
 * `retract.ts` undoes a write `place.ts` or checkout could not keep; `notify.ts` sends the
 * placed-order email. `cancel.ts` runs the cancellation and the sweep behind its marker,
 * `retention.ts` answers an erased account, `scope.ts` decides who may see what,
 * `availability.ts` answers whether a line is still sellable and cancels an order that no longer
 * is.
 */

import {
    search,
    getById,
    create,
    countOpenBankTransfers,
    getByTransferReference,
    recordCreated,
    update,
    updateById,
    remove,
    removeById
} from './crud';
import { placeOrder } from './place';
import { sendOrderPlacedEmail } from './notify';
import { detachUserId, anonymizeDueOrders } from './retention';
import { callerScope, ownerScope, withActions } from './scope';
import { cancelById, retryPendingEffects } from './cancel';
import { markPaid, markShipped, markDelivered } from './status';
import { overrideStatus, forceMove } from './override';
import { unavailableLines } from './availability';
import { renderInvoicePdf, reapOrphanedInvoices, reapExpiredInvoices } from './invoice';

/*
 * Every operation is published by name as well as through the object below: `module.ts` wires
 * `cancelById` and `detachUserId` into the events that trigger them, `orders/index.ts` publishes
 * `retractOrder` to `cart`, and the suites drive the operations directly. Publishing fewer names
 * here would break each of those callers.
 */
export {
    search,
    getById,
    create,
    countOpenBankTransfers,
    getByTransferReference,
    recordCreated,
    update,
    updateById,
    remove,
    removeById,
    ownOrderIds,
    findOwnOrders
} from './crud';
export { retractOrder } from './retract';
export { placeOrder, type PlaceOrderInput, type PlaceOrderOutcome } from './place';
export { sendOrderPlacedEmail } from './notify';
export { cancelById, retryPendingEffects } from './cancel';
export { markPaid, markShipped, markDelivered } from './status';
export { overrideStatus, forceMove } from './override';
export { detachUserId, anonymizeDueOrders } from './retention';
export { callerScope, actorOf, ownerScope, withActions } from './scope';
export { unavailableLines, cancelPendingOrdersHolding, type UnavailableLine } from './availability';
export { freezeOrderLines } from './snapshot';
export { allocateInvoiceNumber } from './invoice-numbering';
export { renderInvoicePdf, reapOrphanedInvoices, reapExpiredInvoices } from './invoice';
// Config getters, re-exported here (not directly from `../index.ts`) because a module's public
// barrel may only publish services/domain/events/emails/model — see `local/barrel-allowed-sources`.
export {
    bankTransferBeneficiary,
    bankTransferBic,
    bankTransferEnabled,
    bankTransferHoldHours,
    bankTransferIban,
    bankTransferIbanFriendly,
    bankTransferMaxOpenPerAccount,
    shopCurrency
} from '../config';

/** The service's public surface — every controller and cross-module caller goes through this. */
export const orderService = {
    search,
    getById,
    callerScope,
    ownerScope,
    create,
    placeOrder,
    sendOrderPlacedEmail,
    countOpenBankTransfers,
    getByTransferReference,
    recordCreated,
    update,
    updateById,
    remove,
    removeById,
    markPaid,
    markShipped,
    markDelivered,
    overrideStatus,
    forceMove,
    detachUserId,
    anonymizeDueOrders,
    renderInvoicePdf,
    reapOrphanedInvoices,
    reapExpiredInvoices,
    cancelById,
    retryPendingEffects,
    unavailableLines,
    withActions
};
