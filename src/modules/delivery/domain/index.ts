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
    isReleasable,
    isAwaitingAnswer
} from './fulfillment';
export type {
    FulfillmentLine,
    FulfillmentOrderDraft,
    FulfillmentReport,
    GroupableLine,
    ProductQuantity,
    ShipLinesVerdict,
    SummaryInputs,
    ActionCandidate
} from './fulfillment';

export {
    SILENT_SLIP_DAYS,
    CONSENT_WINDOW_DAYS,
    judgeSlip,
    judgeMove,
    expectedDateOf,
    answerBy,
    needsDatePassedNotice,
    hasWaitExpired,
    slippedDays,
    boardStateOf,
    isLate
} from './preorder';
export type { BoardFacts, MoveFacts, SlipFacts, SlipVerdict, SweepFacts } from './preorder';
