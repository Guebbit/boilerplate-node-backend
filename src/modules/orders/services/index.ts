/**
 * @module
 * Order service — all business logic for the Order entity, and the one place a controller may call
 * into. A folder rather than one file because it passed ~300 lines; see `docs/theory/layers.md`.
 *
 * `place.ts` is the one function that writes a new order; `read.ts`, `crud.ts` and `remove.ts`
 * read, amend and delete one; `notify.ts` sends the placed-order email. `cancel.ts` runs the cancellation,
 * `retention.ts` answers an erased account, `scope.ts` decides who may see what,
 */

import {
    search,
    getById,
    getForCaller,
    openUnpaidOrderIds,
    getByTransferReference,
    findManyByIds
} from './read';
import { create, recordCreated, update, updateById } from './crud';
import { remove, removeById, restoreById } from './remove';
import { placeOrder } from './place';
import { sendOrderPlacedEmail, mailBuyer } from './notify';
import { detachUserId, eraseUserOrders, startOrderPiiClock, anonymizeDueOrders } from './retention';
import { callerScope, ownerScope, ownLiveScope, withActions } from './scope';
import {
    cancelOnRequestById,
    withdrawById,
    expireReservationById,
    cancelForErasureById,
    cancelForPaymentMismatchById,
    cancelUnanswered
} from './cancel';
import {
    markPaid,
    markProcessing,
    markShipped,
    markDelivered,
    markFulfilmentComplete,
    markPaymentStatus,
    markReturnStatus
} from './status';
import {
    readOrder,
    recordFulfillmentProgress,
    recordForcedFulfilment,
    shipStock,
    refreshShelf
} from './fulfillment';
import { overrideStatus } from './override';
import { openOrderExport } from './export';
import {
    appendTimeline,
    readTimeline,
    collectTimelineOf,
    clearTimelineActor,
    scrubTimelineText,
    deleteTimelineOf
} from './timeline';
import {
    paidBuckets,
    productTotals,
    categoryTotals,
    productSeries,
    customerCounts,
    cancellationCohort,
    pipeline
} from './stats';

/*
 * Every operation is published by name as well as through the object below: `module.ts` wires
 * `expireReservationById` and `detachUserId` into the events that trigger them, `orders/index.ts` publishes
 * `placeOrder` to `cart`, and the suites drive the operations directly. Publishing fewer names
 * here would break each of those callers.
 */
export {
    search,
    getById,
    getForCaller,
    billingAddressOf,
    openUnpaidOrderIds,
    getByTransferReference,
    findManyByIds,
    ownOrderIds,
    findOwnOrders,
    orderBriefsByIds,
    type OrderBrief
} from './read';
export { create, recordCreated, update, updateById } from './crud';
export { remove, removeById, restoreById } from './remove';
export { placeOrder, type PlaceOrderInput, type PlaceOrderOutcome } from './place';
export { sendOrderPlacedEmail, mailBuyer } from './notify';
export {
    cancelOnRequestById,
    withdrawById,
    expireReservationById,
    cancelForErasureById,
    cancelForPaymentMismatchById,
    cancelUnanswered,
    type CancelCause
} from './cancel';
export {
    markPaid,
    markProcessing,
    markShipped,
    markDelivered,
    markFulfilmentComplete,
    markPaymentStatus,
    markReturnStatus
} from './status';
export {
    readOrder,
    recordFulfillmentProgress,
    recordForcedFulfilment,
    shipStock,
    refreshShelf,
    type ForcedFulfilment
} from './fulfillment';
export { overrideStatus } from './override';
export { openOrderExport, type OrderExport } from './export';
export {
    appendTimeline,
    readTimeline,
    collectTimelineOf,
    clearTimelineActor,
    scrubTimelineText,
    deleteTimelineOf
} from './timeline';
export { detachUserId, eraseUserOrders, startOrderPiiClock, anonymizeDueOrders } from './retention';
export { callerScope, cancelScope, actorOf, ownerScope, ownLiveScope, withActions } from './scope';
export { freezeOrderLines } from './snapshot';
export { reencryptOrders } from './reencrypt';
export type {
    PaidBucket,
    ProductTotal,
    CategoryTotal,
    ProductSeriesRead,
    AwaitingTransfers,
    PipelineRead
} from './stats';
// Config getters, re-exported here (not directly from `../index.ts`) because a module's public
// barrel may only publish services/domain/events/emails/model — see `local/barrel-allowed-sources`.
export {
    bankTransferBeneficiary,
    bankTransferBic,
    bankTransferEnabled,
    bankTransferHoldHours,
    bankTransferIban,
    bankTransferIbanFriendly,
    orderFrontendLink,
    withdrawalPeriodDays
} from '../config';

/** The service's public surface — every controller and cross-module caller goes through this. */
export const orderService = {
    search,
    getById,
    getForCaller,
    callerScope,
    ownerScope,
    ownLiveScope,
    create,
    placeOrder,
    sendOrderPlacedEmail,
    mailBuyer,
    openUnpaidOrderIds,
    getByTransferReference,
    findManyByIds,
    paidBuckets,
    productTotals,
    categoryTotals,
    productSeries,
    customerCounts,
    cancellationCohort,
    pipeline,
    recordCreated,
    update,
    updateById,
    remove,
    removeById,
    restoreById,
    markPaid,
    markProcessing,
    markShipped,
    markDelivered,
    markFulfilmentComplete,
    markPaymentStatus,
    markReturnStatus,
    readOrder,
    recordFulfillmentProgress,
    recordForcedFulfilment,
    shipStock,
    refreshShelf,
    overrideStatus,
    openOrderExport,
    appendTimeline,
    readTimeline,
    collectTimelineOf,
    clearTimelineActor,
    scrubTimelineText,
    deleteTimelineOf,
    detachUserId,
    eraseUserOrders,
    startOrderPiiClock,
    anonymizeDueOrders,
    cancelOnRequestById,
    withdrawById,
    expireReservationById,
    cancelForErasureById,
    cancelForPaymentMismatchById,
    cancelUnanswered,
    withActions
};
