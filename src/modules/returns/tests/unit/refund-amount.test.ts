/**
 * @module
 * The refund a received return is owed — pure arithmetic in minor units. Every rule of the
 * Consumer Rights Directive's Art. 13 and 14 the calculation carries has a case here.
 */
import {
    cancellationRefundFor,
    refundAmountFor,
    shippingStillOwed,
    type RefundInputs
} from '../../services/refund-amount';

/** Two shirts at 30.00 and a mug at 10.00, 15.00 express paid where standard would be 5.00. */
const base: RefundInputs = {
    currency: 'EUR',
    reason: 'withdrawal',
    lines: [
        { quantity: 2, unitPrice: 30 },
        { quantity: 1, unitPrice: 10 }
    ],
    takesLastUnit: true,
    shippingPaid: 15,
    cheapestStandardShipping: 5,
    handlingDeduction: 0
};

/** The refund's total, or a loud failure. */
const totalOf = (inputs: RefundInputs): number => {
    const verdict = refundAmountFor(inputs);
    if (!verdict.ok) throw new Error('expected a refund');
    return verdict.breakdown.total;
};

describe('refundAmountFor — the goods', () => {
    it('is the returned lines at the price the order froze', () => {
        expect(totalOf({ ...base, takesLastUnit: false, shippingPaid: 0 })).toBe(70);
    });

    it('is exact — 0.10 three times is 0.30, not 0.30000000000000004', () => {
        expect(
            totalOf({
                ...base,
                takesLastUnit: false,
                lines: [{ quantity: 3, unitPrice: 0.1 }]
            })
        ).toBe(0.3);
    });
});

describe('refundAmountFor — the delivery (Art. 13(2))', () => {
    it('refunds none on a return that is not the last unit — delivery is never refunded twice', () => {
        const verdict = refundAmountFor({ ...base, takesLastUnit: false });

        expect(verdict.ok && verdict.breakdown.shipping).toBe(0);
    });

    it('caps a withdrawal at the cheapest standard delivery — the express surcharge stays with the shop', () => {
        const verdict = refundAmountFor(base);

        expect(verdict.ok && verdict.breakdown.shipping).toBe(5);
    });

    it('refunds all of it when it cost less than the standard delivery', () => {
        const verdict = refundAmountFor({ ...base, shippingPaid: 3 });

        expect(verdict.ok && verdict.breakdown.shipping).toBe(3);
    });

    it('refunds nothing when standard would have been free', () => {
        const verdict = refundAmountFor({ ...base, cheapestStandardShipping: 0 });

        expect(verdict.ok && verdict.breakdown.shipping).toBe(0);
    });

    it.each(['defective', 'wrong_item'] as const)(
        'refunds the whole delivery on %s goods — the seller’s own doing',
        (reason) => {
            const verdict = refundAmountFor({ ...base, reason });

            expect(verdict.ok && verdict.breakdown.shipping).toBe(15);
        }
    );

    it('adds up: goods + delivery', () => {
        expect(totalOf(base)).toBe(75);
    });
});

describe('refundAmountFor — the handling deduction (Art. 14(2))', () => {
    it('is taken off the total and reported', () => {
        const verdict = refundAmountFor({ ...base, handlingDeduction: 12.5 });

        expect(verdict.ok && verdict.breakdown).toEqual({
            goods: 70,
            shipping: 5,
            deduction: 12.5,
            total: 62.5
        });
    });

    it('may eat the whole refund, but not more', () => {
        expect(totalOf({ ...base, handlingDeduction: 75 })).toBe(0);
        expect(refundAmountFor({ ...base, handlingDeduction: 75.01 })).toEqual({
            ok: false,
            reason: 'deduction-too-high'
        });
    });
});

describe('refundAmountFor — currencies without a hundredth', () => {
    it('works in whole yen', () => {
        expect(
            totalOf({
                ...base,
                currency: 'JPY',
                takesLastUnit: false,
                lines: [{ quantity: 2, unitPrice: 1200 }]
            })
        ).toBe(2400);
    });
});

describe('refundAmountFor — the delivery still owed', () => {
    it('caps what a return refunds at what earlier refunds left unreturned', () => {
        // 15.00 paid, 12.00 already refunded by an earlier cancel: only 3.00 is left to give back.
        const owed = shippingStillOwed('EUR', 15, 12);

        const verdict = refundAmountFor({ ...base, shippingPaid: owed });

        expect(owed).toBe(3);
        expect(verdict.ok && verdict.breakdown.shipping).toBe(3);
    });
});

describe('shippingStillOwed', () => {
    it('is what was paid, less what was already refunded', () => {
        expect(shippingStillOwed('EUR', 15, 0)).toBe(15);
        expect(shippingStillOwed('EUR', 15, 5)).toBe(10);
    });

    it('never goes below zero, and is exact in minor units', () => {
        expect(shippingStillOwed('EUR', 15, 15)).toBe(0);
        expect(shippingStillOwed('EUR', 15, 20)).toBe(0);
        expect(shippingStillOwed('EUR', 0.3, 0.1 + 0.1)).toBe(0.1);
    });
});

describe('cancellationRefundFor', () => {
    const cancel = {
        currency: 'EUR',
        lines: [
            { quantity: 2, unitPrice: 30 },
            { quantity: 1, unitPrice: 10 }
        ],
        takesLastUnit: false,
        shippingPaid: 15
    };

    it('is the cancelled lines alone when other units remain', () => {
        expect(cancellationRefundFor(cancel)).toEqual({
            goods: 70,
            shipping: 0,
            deduction: 0,
            total: 70
        });
    });

    it('adds ALL the delivery still owed on the cancel that takes the last unit — no cap, no goods were delivered for it', () => {
        expect(cancellationRefundFor({ ...cancel, takesLastUnit: true })).toEqual({
            goods: 70,
            shipping: 15,
            deduction: 0,
            total: 85
        });
    });

    it('is exact — 0.10 three times is 0.30', () => {
        expect(
            cancellationRefundFor({ ...cancel, lines: [{ quantity: 3, unitPrice: 0.1 }] }).total
        ).toBe(0.3);
    });
});
