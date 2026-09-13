/**
 * @module
 * Payments — public barrel; the only surface a sibling may import (see
 * `modules/products/index.ts` for the rule). One export: `paymentService`, so a caller reads the
 * whole curated surface rather than reaching for one function today and a different one tomorrow.
 * `cart` is the one sibling that reaches it, to validate a checkout's `paymentMethod` against
 * `paymentService.listPaymentMethods()` rather than keeping a second opinion on what this
 * deployment offers.
 *
 * See: docs/modules/payments.md
 */

export { paymentService } from './services';
export { PAYMENT_SUCCEEDED, PAYMENT_FAILED } from './events';
