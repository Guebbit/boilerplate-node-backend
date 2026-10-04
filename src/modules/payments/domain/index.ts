/**
 * @module
 * Payments — domain layer: pure rules only, lint-guaranteed free of Express, Mongoose and every
 * tier. The status vocabulary is 6-wide, past the threshold that makes a `domain/` folder
 * mandatory, so it gets one rather than living as a scattered constant beside each write that
 * reads it.
 *
 * See `docs/theory/domain-layer.md`.
 */

export {
    CONFIRMABLE_PAYMENT_STATUSES,
    SETTLEABLE_PAYMENT_STATUSES,
    REFUNDABLE_PAYMENT_STATUS,
    OPEN_REFUND_STATUSES
} from './lifecycle';
