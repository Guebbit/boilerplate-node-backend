/**
 * @module
 * Delivery domain — the rules, importable without the module's HTTP surface.
 * See `docs/theory/domain-layer.md`.
 */

export { holdNoticeOf, holdNeedsBuyerNotice } from './hold-notice';

export {
    SHIPPING_METHODS,
    findShippingMethod,
    priceShipping,
    methodFitsWeight,
    cheapestStandardShipping
} from './rates';
export type { StaticShippingMethod } from './rates';

export {
    groupOrderLines,
    remainingOf,
    remainingOfLine,
    remainderLines,
    statusOfLines,
    checkShipLines,
    withShipped,
    withRemainderCancelled,
    summarize,
    isShippable,
    isFulfillable,
    isHoldable,
    isReleasable
} from './fulfillment';
export type {
    FulfillmentLine,
    FulfillmentOrderDraft,
    FulfillmentReport,
    GroupableLine,
    ProductQuantity,
    WaitCause,
    ShipLinesVerdict,
    SummaryInputs,
    ActionCandidate
} from './fulfillment';

export { withLoss, withRestoration, planRestoration, owedDateOf } from './lost';
export type { LostShipmentFacts, OwedDate, Restoration, RestorableFulfillmentOrder } from './lost';

export { planReopening, shareOwed } from './reship';
export type { ReopenableFulfillmentOrder, Reopening } from './reship';

export { isAwaitingTracking } from './tracking';
export type { TrackingFacts } from './tracking';

export {
    judgeSlip,
    judgeMove,
    expectedDateOf,
    expectedDateOfWaiting,
    needsDueNotice,
    DUE_NOTICE_LEAD_MS,
    slippedDays,
    promisedAfterNotice,
    boardStateOf,
    isLate
} from './preorder';
export type { BoardFacts, MoveFacts, SlipFacts, SlipVerdict, SweepFacts } from './preorder';
