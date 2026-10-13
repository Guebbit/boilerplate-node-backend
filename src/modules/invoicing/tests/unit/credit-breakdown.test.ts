/**
 * @module
 * `creditBreakdownOf` over `creditShares` — the figures of a partial credit note add up: VAT is
 * extracted once per rate and the gross reconciles to the refunded amount, to the cent.
 */
import { creditShares, type CreditableInvoice } from '../../domain';
import { creditBreakdownOf } from '../../services/credit-breakdown';

/** An invoice of 122.00 at 22% and 110.00 at 10% — 232.00 gross in all. */
const invoice: CreditableInvoice = {
    currency: 'EUR',
    lines: [],
    shippingByRate: [],
    taxSummary: [
        { rate: 0.1, grossAmount: 110 },
        { rate: 0.22, grossAmount: 122 }
    ]
};

/**
 * The breakdown of a credit note refunding `amount` of `source`.
 * @param source - the invoice
 * @param amount - the refunded gross amount
 */
const breakdownOf = (source: CreditableInvoice, amount: number) =>
    creditBreakdownOf(creditShares(source, amount, 'Refund'), source.currency);

describe('creditBreakdownOf', () => {
    it('reconciles: the derived gross across the summary rows is exactly the refunded amount', () => {
        const breakdown = breakdownOf(invoice, 50);

        const gross = breakdown.taxSummary.reduce((sum, row) => sum + row.grossAmount, 0);
        expect(Math.round(gross * 100)).toBe(5000);
        expect(breakdown.netTotal + breakdown.taxTotal).toBeCloseTo(50, 2);
    });

    it('carries no shipping of its own — the shipped share is folded into the rate rows', () => {
        const breakdown = breakdownOf(invoice, 50);

        expect(breakdown.shippingNetAmount).toBe(0);
        expect(breakdown.shippingByRate).toEqual([]);
    });

    it('refunding 10.00 of 62.30: 2.92 at 10%, 7.08 at 22%, each rate taxed once', () => {
        // 10%: round(292 x 0.1/1.1) = round(26.55) = 27, net 265.
        // 22%: round(708 x 0.22/1.22) = round(127.67) = 128, net 580.
        const mixed: CreditableInvoice = {
            currency: 'EUR',
            lines: [],
            shippingByRate: [],
            taxSummary: [
                { rate: 0.1, grossAmount: 18.25 },
                { rate: 0.22, grossAmount: 44.05 }
            ]
        };

        const breakdown = breakdownOf(mixed, 10);

        expect(breakdown.taxSummary).toEqual([
            { rate: 0.1, netAmount: 2.65, taxAmount: 0.27, grossAmount: 2.92 },
            { rate: 0.22, netAmount: 5.8, taxAmount: 1.28, grossAmount: 7.08 }
        ]);
        expect(breakdown.netTotal).toBe(8.45);
        expect(breakdown.taxTotal).toBe(1.55);
    });

    it('a zero-decimal currency (JPY) refunds whole yen and rounds the VAT to a whole yen', () => {
        // 105 yen at 8%: round(105 x 0.08/1.08) = round(7.78) = 8, net 97.
        const yen: CreditableInvoice = {
            currency: 'JPY',
            lines: [],
            shippingByRate: [],
            taxSummary: [{ rate: 0.08, grossAmount: 315 }]
        };

        expect(breakdownOf(yen, 105).taxSummary).toEqual([
            { rate: 0.08, netAmount: 97, taxAmount: 8, grossAmount: 105 }
        ]);
    });

    it("credits a returned book at the book's rate only", () => {
        const withBook: CreditableInvoice = {
            currency: 'EUR',
            lines: [{ productId: 'book', unitPrice: 11, taxRate: 0.1 }],
            shippingByRate: [],
            taxSummary: [
                { rate: 0.1, grossAmount: 24.2 },
                { rate: 0.22, grossAmount: 71 }
            ]
        };
        const lines = creditShares(withBook, 11, 'Refund', {
            lines: [{ productId: 'book', quantity: 1 }],
            shipping: 0
        });

        expect(creditBreakdownOf(lines, 'EUR').taxSummary).toEqual([
            { rate: 0.1, netAmount: 10, taxAmount: 1, grossAmount: 11 }
        ]);
    });
});
