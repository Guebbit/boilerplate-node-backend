/**
 * @module
 * `partialCredit` — spreading a refunded amount across an invoice's VAT rates. Pure, so the
 * arithmetic is pinned here without a database; `issue-credit-note.test.ts` covers it through the
 * real refund.
 */
import { asStub } from '@tests/stub';
import type { InvoiceDocument } from '../../model';
import { partialCredit } from '../../services/partial-credit';

/** An invoice of 122.00 at 22% and 110.00 at 10% — 232.00 gross in all. */
const invoice = asStub<InvoiceDocument>({
    currency: 'EUR',
    taxSummary: [
        { rate: 0.1, netAmount: 100, taxAmount: 10, grossAmount: 110 },
        { rate: 0.22, netAmount: 100, taxAmount: 22, grossAmount: 122 }
    ]
});

describe('partialCredit', () => {
    it('spreads the refunded amount over the rates in proportion to what each collected', () => {
        const { lines } = partialCredit(invoice, 23.2, 'Refund');

        expect(lines).toEqual([
            { title: 'Refund', quantity: 1, unitPrice: 11, taxRate: 0.1 },
            { title: 'Refund', quantity: 1, unitPrice: 12.2, taxRate: 0.22 }
        ]);
    });

    it('reconciles: the derived gross across the summary rows is exactly the refunded amount', () => {
        const { breakdown } = partialCredit(invoice, 50, 'Refund');

        const gross = breakdown.taxSummary.reduce((sum, row) => sum + row.grossAmount, 0);
        expect(Math.round(gross * 100)).toBe(5000);
        expect(breakdown.netTotal + breakdown.taxTotal).toBeCloseTo(50, 2);
    });

    it('never invents a rate — every line carries one the invoice charged', () => {
        const { lines } = partialCredit(invoice, 0.07, 'Refund');

        for (const line of lines) expect([0.1, 0.22]).toContain(line.taxRate);
    });

    it('leaves out a rate whose share rounds to nothing', () => {
        const { lines } = partialCredit(invoice, 0.01, 'Refund');

        expect(lines).toHaveLength(1);
        expect(lines[0].unitPrice).toBe(0.01);
    });

    it('carries no shipping of its own — the shipped share is folded into the rate rows', () => {
        const { breakdown } = partialCredit(invoice, 50, 'Refund');

        expect(breakdown.shippingNetAmount).toBe(0);
        expect(breakdown.shippingByRate).toEqual([]);
    });
});
