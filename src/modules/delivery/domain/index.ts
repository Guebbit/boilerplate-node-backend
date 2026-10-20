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

export {
    judgeSlip,
    judgeMove,
    expectedDateOf,
    expectedDateOfWaiting,
    needsDueNotice,
    slippedDays,
    boardStateOf,
    isLate
} from './preorder';
export type { BoardFacts, MoveFacts, SlipFacts, SlipVerdict, SweepFacts } from './preorder';
