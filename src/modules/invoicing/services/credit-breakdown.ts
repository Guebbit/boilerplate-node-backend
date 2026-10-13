/**
 * @module
 * The VAT figures of a partial credit note — the one place the split lines meet the tax function.
 *
 * Kept out of `domain/credit-shares.ts` on purpose: the tax extraction is `orders`' rule, and a
 * domain folder may not reach a sibling module.
 *
 * See: docs/modules/invoicing.md#issuing-a-document
 */

import { orderTaxBreakdown, type OrderTaxBreakdown } from '@modules/orders';
import type { CreditLine } from '../domain';

/**
 * Extract VAT from every share the way the invoice itself did, so the figures reconcile exactly.
 *
 * @param lines - the shares `creditShares` produced
 * @param currency - the invoice's currency
 * @returns the breakdown those lines derive; no delivery of its own — it is folded into the rate rows
 */
export const creditBreakdownOf = (
    lines: readonly CreditLine[],
    currency: string
): OrderTaxBreakdown =>
    orderTaxBreakdown({
        items: lines.map((line) => ({
            quantity: line.quantity,
            product: { price: line.unitPrice, taxRate: line.taxRate, requiresShipping: false }
        })),
        shippingCost: undefined,
        currency
    });
