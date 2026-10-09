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
    lines: [],
    shippingByRate: [],
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

describe('partialCredit — worked examples, VAT rounded once per rate', () => {
    /** The mixed-rate invoice of `orders/tests/unit/tax.test.ts`: 18.25 at 10% and 44.05 at 22%, shipping included. */
    const mixed = asStub<InvoiceDocument>({
        currency: 'EUR',
        taxSummary: [
            { rate: 0.1, netAmount: 16.59, taxAmount: 1.66, grossAmount: 18.25 },
            { rate: 0.22, netAmount: 36.11, taxAmount: 7.94, grossAmount: 44.05 }
        ]
    });

    it('refunding 10.00 of 62.30: 2.92 at 10%, 7.08 at 22%, each rate taxed once', () => {
        // Shares of 1000 cents by gross weight 1825 : 4405 -> floor 292 and 707, the odd cent goes
        // to the heavier rate -> 292 / 708.
        // 10%: round(292 x 0.1/1.1) = round(26.55) = 27, net 265.
        // 22%: round(708 x 0.22/1.22) = round(127.67) = 128, net 580.
        const { lines, breakdown } = partialCredit(mixed, 10, 'Refund');

        expect(lines.map((line) => line.unitPrice)).toEqual([2.92, 7.08]);
        expect(breakdown.taxSummary).toEqual([
            { rate: 0.1, netAmount: 2.65, taxAmount: 0.27, grossAmount: 2.92 },
            { rate: 0.22, netAmount: 5.8, taxAmount: 1.28, grossAmount: 7.08 }
        ]);
        expect(breakdown.netTotal).toBe(8.45);
        expect(breakdown.taxTotal).toBe(1.55);
    });

    it('a zero-decimal currency (JPY) refunds whole yen and rounds the VAT to a whole yen', () => {
        // 105 yen at 8%: round(105 x 0.08/1.08) = round(7.78) = 8, net 97.
        const yen = asStub<InvoiceDocument>({
            currency: 'JPY',
            taxSummary: [{ rate: 0.08, netAmount: 292, taxAmount: 23, grossAmount: 315 }]
        });

        const { breakdown } = partialCredit(yen, 105, 'Refund');

        expect(breakdown.taxSummary).toEqual([
            { rate: 0.08, netAmount: 97, taxAmount: 8, grossAmount: 105 }
        ]);
    });
});

describe('partialCredit — a refund for specific goods', () => {
    const BOOK = '64b64c4f4f4f4f4f4f4f4f01';
    const LAMP = '64b64c4f4f4f4f4f4f4f4f02';

    /**
     * A book at 10% (2 x 11.00) and a lamp at 22% (1 x 61.00), with 12.20 of delivery split
     * 2.20 / 10.00 between the two rates.
     */
    const mixed = asStub<InvoiceDocument>({
        currency: 'EUR',
        lines: [
            { productId: BOOK, title: 'Book', quantity: 2, unitPrice: 11, taxRate: 0.1 },
            { productId: LAMP, title: 'Lamp', quantity: 1, unitPrice: 61, taxRate: 0.22 }
        ],
        shippingByRate: [
            { rate: 0.1, netAmount: 2, taxAmount: 0.2, grossAmount: 2.2 },
            { rate: 0.22, netAmount: 8.2, taxAmount: 1.8, grossAmount: 10 }
        ],
        taxSummary: [
            { rate: 0.1, netAmount: 22, taxAmount: 2.2, grossAmount: 24.2 },
            { rate: 0.22, netAmount: 58.2, taxAmount: 12.8, grossAmount: 71 }
        ]
    });

    it("credits a returned book at the book's rate only", () => {
        const { lines, breakdown } = partialCredit(mixed, 11, 'Refund', {
            lines: [{ productId: BOOK, quantity: 1 }],
            shipping: 0
        });

        expect(lines).toEqual([{ title: 'Refund', quantity: 1, unitPrice: 11, taxRate: 0.1 }]);
        expect(breakdown.taxSummary).toEqual([
            { rate: 0.1, netAmount: 10, taxAmount: 1, grossAmount: 11 }
        ]);
    });

    it('credits refunded delivery at the rates the invoice charged it at', () => {
        // Weights: 10% = 2 x 11.00 + 2.20 = 24.20; 22% = 61.00 + 10.00 = 71.00 — the whole invoice.
        const { lines } = partialCredit(mixed, 95.2, 'Refund', {
            lines: [
                { productId: BOOK, quantity: 2 },
                { productId: LAMP, quantity: 1 }
            ],
            shipping: 12.2
        });

        expect(lines.map((line) => [line.taxRate, line.unitPrice])).toEqual([
            [0.1, 24.2],
            [0.22, 71]
        ]);
    });

    it('splits a refund smaller than its goods (a deduction) across their rates only', () => {
        // The lamp alone came back, 6.00 kept for handling: 55.00 refunded, all of it at 22%.
        const { lines } = partialCredit(mixed, 55, 'Refund', {
            lines: [{ productId: LAMP, quantity: 1 }],
            shipping: 0
        });

        expect(lines).toEqual([{ title: 'Refund', quantity: 1, unitPrice: 55, taxRate: 0.22 }]);
    });

    it('falls back to every rate when no returned line is on the invoice', () => {
        const { lines } = partialCredit(mixed, 95.2, 'Refund', {
            lines: [{ productId: '64b64c4f4f4f4f4f4f4f4fff', quantity: 1 }],
            shipping: 0
        });

        expect(lines.map((line) => line.unitPrice)).toEqual([24.2, 71]);
    });
});
