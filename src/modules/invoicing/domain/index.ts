/**
 * @module
 * Invoicing — domain layer: pure rules only, lint-guaranteed free of Express, Mongoose and every
 * tier. See `docs/theory/domain-layer.md`.
 */

export { creditShares } from './credit-shares';
export type { CreditableInvoice, RefundedGoods, CreditLine } from './credit-shares';
export { asTaxItems } from './tax-items';
