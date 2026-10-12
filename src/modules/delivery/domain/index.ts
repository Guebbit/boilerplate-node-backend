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
    isReleasable
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
