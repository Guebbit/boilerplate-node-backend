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
import { getForOrder } from './read';
import { shipFulfillmentOrder } from './ship';
import { deliverShipment } from './deliver';
import { fulfillFulfillmentOrder } from './fulfill';
import { holdFulfillmentOrder, releaseFulfillmentOrder } from './holds';
import { editShipmentTracking } from './tracking';

export { listMethods, startFulfilment } from './start';
export {
    getForOrder,
    shippedQuantities,
    remainderOptions,
    findShipmentsForOrders,
    findFulfillmentOrdersForOrders,
    type RemainderOption
} from './read';
export { ensureFulfillmentOrders } from './ensure';
export { shipFulfillmentOrder, type ShipInput } from './ship';
export { deliverShipment, type DeliverInput } from './deliver';
export { fulfillFulfillmentOrder } from './fulfill';
export { holdFulfillmentOrder, releaseFulfillmentOrder, type HoldInput } from './holds';
export { editShipmentTracking } from './tracking';
export { cancelRemainder, cancelAllForOrder, type RemainderCancel } from './cancel-remainder';
export { syncWithOverride } from './override-sync';
export { ActRefusal } from './act';
export { splitForAllocation, type Split } from './split';
export { scrubHoldNotes } from './retention';

/** The module's one service handle — every controller in this module goes through it. */
export const deliveryService = {
    listMethods,
    getForOrder,
    startFulfilment,
    shipFulfillmentOrder,
    deliverShipment,
    fulfillFulfillmentOrder,
    holdFulfillmentOrder,
    releaseFulfillmentOrder,
    editShipmentTracking
};
