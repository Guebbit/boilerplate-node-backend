/**
 * @module
 * Payments — public barrel; the only surface a sibling may import (see
 * `modules/products/index.ts` for the rule). One export: `paymentService`, so a caller reads the
 * whole curated surface rather than reaching for one function today and a different one tomorrow.
 *
 * See: docs/modules/payments.md
 */

export { paymentService } from './service';
