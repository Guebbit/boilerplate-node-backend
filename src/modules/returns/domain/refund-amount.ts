/**
 * @module
 * What a received return is owed — pure arithmetic in integer minor units, so the figure a customer
 * is quoted and the figure `payments` sends can never differ by a cent of float drift.
 *
 * Amount = the returned lines + the refundable shipping − the handling deduction.
 *
 * Shipping is refunded by whichever cancel or return takes the LAST unit of the order — never twice,
 * and never split across the partial ones. That is standard practice, and the only reading of Art.
 * 13(2) that does not refund delivery twice across two partial returns. How much depends on what
 * closes the order: a cancel refunds all of it (nothing was delivered for it, as a pre-dispatch
 * cancel always has); a return refunds by its reason — a withdrawal gets back up to the cheapest
 * standard delivery the shop offers (a dearer method's surcharge stays with the shop, Art. 13(2));
 * goods that were faulty or not what was ordered are the seller's own doing, so the whole delivery
 * goes back.
 *
 * See: docs/modules/returns.md#what-the-customer-gets-back
 */

import {
    addMoney,
    NO_MONEY,
    scaleMoney,
    subtractMoney,
    toDecimalAmount,
    toMinorUnits,
    type Money
} from '@shared-kernel/money';
import type { ReturnReason } from './lifecycle';

/** What the calculation needs from the return and its order. */
export interface RefundInputs {
    currency: string;
    reason: ReturnReason;
    /** The returned lines, with the gross unit price the order froze. */
    lines: readonly { quantity: number; unitPrice: number }[];
    /** Whether this return takes the last unit of the order: every other unit is already cancelled or back. */
    takesLastUnit: boolean;
    /** The delivery still owed back: what the customer paid, less what earlier refunds returned. */
    shippingPaid: number;
    /** What the shop's cheapest standard delivery would have cost on this order. */
    cheapestStandardShipping: number;
    /** What staff keep back for handling damage (Art. 14(2)). */
    handlingDeduction: number;
}

/** The breakdown, in decimals for the wire and the ledger. */
export interface RefundBreakdown {
    goods: number;
    shipping: number;
    deduction: number;
    total: number;
}

/** The verdict: a breakdown, or why the deduction cannot stand. */
export type RefundVerdict =
    | { ok: true; breakdown: RefundBreakdown }
    | { ok: false; reason: 'deduction-too-high' };

/**
 * What the returned lines cost at the gross price the order froze, in minor units.
 * @param lines - the lines, each with its frozen unit price
 * @param currency - the ISO-4217 code the prices are in
 */
const goodsOf = (
    lines: readonly { quantity: number; unitPrice: number }[],
    currency: string
): Money =>
    addMoney(
        ...lines.map(({ unitPrice, quantity }) =>
            scaleMoney(toMinorUnits(unitPrice, currency), quantity)
        )
    );

/**
 * The delivery a return refunds, in minor units.
 * @param inputs - the return and its order
 */
const refundableShipping = (inputs: RefundInputs): Money => {
    if (!inputs.takesLastUnit) return NO_MONEY;

    const paid = toMinorUnits(inputs.shippingPaid, inputs.currency);
    if (inputs.reason === 'defective' || inputs.reason === 'wrong_item') return paid;

    const cheapest = toMinorUnits(inputs.cheapestStandardShipping, inputs.currency);
    // `as`: Math.min returns a bare number; both operands are Money, so the smaller one is too.
    return Math.min(paid, cheapest) as Money;
};

/**
 * Work out what a received return is owed.
 *
 * @param inputs - the return and its order
 * @returns the breakdown, or `deduction-too-high` when the deduction would eat more than the goods
 *   and shipping are worth — a refund cannot be negative
 */
export const refundAmountFor = (inputs: RefundInputs): RefundVerdict => {
    const { currency, lines, handlingDeduction } = inputs;
    const goods = goodsOf(lines, currency);

    const shipping = refundableShipping(inputs);
    const deduction = toMinorUnits(handlingDeduction, currency);
    if (deduction > addMoney(goods, shipping)) return { ok: false, reason: 'deduction-too-high' };

    const decimal = (amount: Money): number => toDecimalAmount(amount, currency);
    return {
        ok: true,
        breakdown: {
            goods: decimal(goods),
            shipping: decimal(shipping),
            deduction: decimal(deduction),
            total: decimal(subtractMoney(addMoney(goods, shipping), deduction))
        }
    };
};

/** What a remainder cancel needs from the order and its other returns. */
export interface CancellationInputs {
    currency: string;
    /** The cancelled lines, with the gross unit price the order froze. */
    lines: readonly { quantity: number; unitPrice: number }[];
    /** Whether this cancel takes the last unit of the order. */
    takesLastUnit: boolean;
    /** The delivery still owed back: what the customer paid, less what earlier refunds returned. */
    shippingPaid: number;
}

/**
 * What cancelling a fulfillment order's remainder refunds: the cancelled lines, plus ALL the
 * delivery still owed when this cancel takes the last unit (as a cancel before dispatch always
 * refunds it — no goods were delivered for it, so Art. 13(2)'s cheapest-standard cap, which
 * exists for delivery that happened, has nothing to apply to). No handling deduction: nothing came
 * back to be damaged.
 *
 * @param inputs - the cancel and its order
 * @returns the breakdown, in decimals for the wire and the ledger
 */
export const cancellationRefundFor = (inputs: CancellationInputs): RefundBreakdown => {
    const { currency, lines } = inputs;
    const goods = goodsOf(lines, currency);
    const shipping = inputs.takesLastUnit ? toMinorUnits(inputs.shippingPaid, currency) : NO_MONEY;

    const decimal = (amount: Money): number => toDecimalAmount(amount, currency);
    return {
        goods: decimal(goods),
        shipping: decimal(shipping),
        deduction: 0,
        total: decimal(addMoney(goods, shipping))
    };
};

/**
 * The delivery not yet refunded: what was paid, less what earlier returns and cancels already
 * handed back. The guard that keeps delivery from being refunded twice.
 *
 * @param currency - the order's currency
 * @param shippingPaid - the delivery the customer paid
 * @param alreadyRefunded - the delivery inside every earlier return and cancel
 */
export const shippingStillOwed = (
    currency: string,
    shippingPaid: number,
    alreadyRefunded: number
): number => {
    const owed = subtractMoney(
        toMinorUnits(shippingPaid, currency),
        toMinorUnits(alreadyRefunded, currency)
    );
    // `as`: Math.max returns a bare number; both operands are Money, so the larger one is too.
    return toDecimalAmount(Math.max(owed, NO_MONEY) as Money, currency);
};
