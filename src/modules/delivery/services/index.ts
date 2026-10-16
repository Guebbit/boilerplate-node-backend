/**
 * @module
 * Delivery service — every operation a controller may call into, and the narrow reads and doors a
 * sibling may use. A folder rather than one file because the module passed ~1000 lines; see
 * `docs/theory/layers.md`.
 *
 * Every act (`ship`, `deliver`, `fulfill`, `holds`, `cancel-remainder`) is one transaction —
 * `act.ts` — that writes the fulfilment records, the order's summary, any status move and the
 * events together. `read.ts` answers the reads, `ensure.ts` makes the fulfillment orders,
 * `override-sync.ts` keeps them in step with an admin override.
 */

import { listMethods, startFulfilment } from './start';
import {
    getForOrder,
    shippedQuantities,
    remainderOptions,
    waitHasExpired,
    findShipmentsForOrders,
    findFulfillmentOrdersForOrders
} from './read';
import { ensureFulfillmentOrders } from './ensure';
import { shipFulfillmentOrder } from './ship';
import { deliverShipment } from './deliver';
import { fulfillFulfillmentOrder } from './fulfill';
import { holdFulfillmentOrder, releaseFulfillmentOrder } from './holds';
import { editShipmentTracking } from './tracking';
import { cancelRemainder, cancelAllForOrder } from './cancel-remainder';
import { syncWithOverride } from './override-sync';
import { splitForAllocation } from './split';
import { releaseAllocated } from './release-allocated';
import { onReleaseDateChanged } from './slip';
import { runPreorderSweep } from './preorder-sweep';
import { confirmWait } from './confirm-wait';
import { listPreorderFulfillmentOrders, summarizePreorders } from './board';
import { scrubHoldNotes } from './retention';

export type { RemainderOption } from './read';
export type { ShipInput } from './ship';
export type { DeliverInput } from './deliver';
export type { HoldInput } from './holds';
export type { RemainderCancel } from './cancel-remainder';
export type { Split } from './split';
export type { PreorderSweepResult } from './preorder-sweep';
export type { BoardQuery } from './board';
export { ActRefusal } from './act';

/** The module's one door — every operation on fulfillment orders and shipments. */
export const deliveryService = {
    listMethods,
    getForOrder,
    startFulfilment,
    shipFulfillmentOrder,
    deliverShipment,
    fulfillFulfillmentOrder,
    holdFulfillmentOrder,
    releaseFulfillmentOrder,
    editShipmentTracking,
    confirmWait,
    shippedQuantities,
    remainderOptions,
    waitHasExpired,
    findShipmentsForOrders,
    findFulfillmentOrdersForOrders,
    ensureFulfillmentOrders,
    cancelRemainder,
    cancelAllForOrder,
    syncWithOverride,
    splitForAllocation,
    releaseAllocated,
    onReleaseDateChanged,
    runPreorderSweep,
    listPreorderFulfillmentOrders,
    summarizePreorders,
    scrubHoldNotes
};
