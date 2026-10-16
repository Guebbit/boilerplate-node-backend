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
    billingAddressOf,
    openUnpaidOrderIds,
    findManyByIds,
    ownOrderIds,
    findOwnOrders,
    orderBriefsByIds
} from './read';
import { create, recordCreated, updateById } from './crud';
import { removeById, restoreById } from './remove';
import { placeOrder } from './place';
import { sendOrderPlacedEmail, mailBuyer } from './notify';
import { detachUserId, eraseUserOrders, startOrderPiiClock, anonymizeDueOrders } from './retention';
import { callerScope, cancelScope, actorOf, ownerScope, ownLiveScope, withActions } from './scope';
import { freezeOrderLines } from './snapshot';
import { reencryptOrders } from './reencrypt';
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

export type { OrderBrief } from './read';
export type { PlaceOrderInput, PlaceOrderOutcome } from './place';
export type { CancelCause } from './cancel';
export type { ForcedFulfilment } from './fulfillment';
export type { OrderExport } from './export';
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
export { orderFrontendLink, withdrawalPeriodDays } from '../config';

/** The service's public surface — every controller and cross-module caller goes through this. */
export const orderService = {
    search,
    getById,
    getForCaller,
    callerScope,
    cancelScope,
    actorOf,
    ownerScope,
    ownLiveScope,
    billingAddressOf,
    ownOrderIds,
    findOwnOrders,
    orderBriefsByIds,
    freezeOrderLines,
    reencryptOrders,
    create,
    placeOrder,
    sendOrderPlacedEmail,
    mailBuyer,
    openUnpaidOrderIds,
    findManyByIds,
    paidBuckets,
    productTotals,
    categoryTotals,
    productSeries,
    customerCounts,
    cancellationCohort,
    pipeline,
    recordCreated,
    updateById,
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
