/**
 * @module
 * Invoicing — domain layer: pure rules only, lint-guaranteed free of Express, Mongoose and every
 * tier.
 *
 * @see docs/understand/domain-layer.md#the-rule-enforced-by-lint
 */

export { creditShares } from './credit-shares';
export type { CreditableInvoice, RefundedGoods, CreditLine } from './credit-shares';
export { remainderLines } from './remainder';
export { asTaxItems } from './tax-items';
export { buyerRetentionEnd, isBuyerRetentionOver, buyerRetentionScanBound } from './retention';
