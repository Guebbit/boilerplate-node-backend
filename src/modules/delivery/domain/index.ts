/**
 * @module
 * Delivery domain — the rules, importable without the module's HTTP surface.
 * See `docs/theory/domain-layer.md`.
 */

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
    answerBy,
    needsDatePassedNotice,
    hasWaitExpired,
    slippedDays,
    boardStateOf,
    isLate
} from './preorder';
export type { BoardFacts, SlipFacts, SlipVerdict, SweepFacts } from './preorder';
