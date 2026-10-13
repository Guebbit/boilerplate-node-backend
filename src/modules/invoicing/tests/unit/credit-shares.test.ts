/**
 * @module
 * `creditShares` — spreading a refunded amount across an invoice's VAT rates. Pure data in, lines
 * out, so the arithmetic is pinned here without a database or the tax function;
 * `src/modules/invoicing/tests/unit/credit-breakdown.test.ts` pins that the figures add up, and `src/modules/invoicing/tests/integration/issue-credit-note.test.ts` covers
 * it through the real refund.
 */
import { creditShares, type CreditableInvoice } from '../../domain';

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

describe('creditShares', () => {
    it('spreads the refunded amount over the rates in proportion to what each collected', () => {
        const lines = creditShares(invoice, 23.2, 'Refund');

        expect(lines).toEqual([
            { title: 'Refund', quantity: 1, unitPrice: 11, taxRate: 0.1 },
            { title: 'Refund', quantity: 1, unitPrice: 12.2, taxRate: 0.22 }
        ]);
    });

    it('never invents a rate — every line carries one the invoice charged', () => {
        const lines = creditShares(invoice, 0.07, 'Refund');

        for (const line of lines) expect([0.1, 0.22]).toContain(line.taxRate);
    });

    it('leaves out a rate whose share rounds to nothing', () => {
        const lines = creditShares(invoice, 0.01, 'Refund');

        expect(lines).toHaveLength(1);
        expect(lines[0].unitPrice).toBe(0.01);
    });

    it('gives the odd cent to the heaviest rate', () => {
        // Shares of 1000 cents by gross weight 1825 : 4405 -> floor 292 and 707, the odd cent goes
        // to the heavier rate -> 292 / 708.
        const mixed: CreditableInvoice = {
            currency: 'EUR',
            lines: [],
            shippingByRate: [],
            taxSummary: [
                { rate: 0.1, grossAmount: 18.25 },
                { rate: 0.22, grossAmount: 44.05 }
            ]
        };

        expect(creditShares(mixed, 10, 'Refund').map((line) => line.unitPrice)).toEqual([
            2.92, 7.08
        ]);
    });
});

describe('creditShares — a refund for specific goods', () => {
    const BOOK = '64b64c4f4f4f4f4f4f4f4f01';
    const LAMP = '64b64c4f4f4f4f4f4f4f4f02';

    /**
     * A book at 10% (2 x 11.00) and a lamp at 22% (1 x 61.00), with 12.20 of delivery split
     * 2.20 / 10.00 between the two rates.
     */
    const mixed: CreditableInvoice = {
        currency: 'EUR',
        lines: [
            { productId: BOOK, unitPrice: 11, taxRate: 0.1 },
            { productId: LAMP, unitPrice: 61, taxRate: 0.22 }
        ],
        shippingByRate: [
            { rate: 0.1, grossAmount: 2.2 },
            { rate: 0.22, grossAmount: 10 }
        ],
        taxSummary: [
            { rate: 0.1, grossAmount: 24.2 },
            { rate: 0.22, grossAmount: 71 }
        ]
    };

    it("credits a returned book at the book's rate only", () => {
        const lines = creditShares(mixed, 11, 'Refund', {
            lines: [{ productId: BOOK, quantity: 1 }],
            shipping: 0
        });

        expect(lines).toEqual([{ title: 'Refund', quantity: 1, unitPrice: 11, taxRate: 0.1 }]);
    });

    it('credits refunded delivery at the rates the invoice charged it at', () => {
        // Weights: 10% = 2 x 11.00 + 2.20 = 24.20; 22% = 61.00 + 10.00 = 71.00 — the whole invoice.
        const lines = creditShares(mixed, 95.2, 'Refund', {
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
        const lines = creditShares(mixed, 55, 'Refund', {
            lines: [{ productId: LAMP, quantity: 1 }],
            shipping: 0
        });

        expect(lines).toEqual([{ title: 'Refund', quantity: 1, unitPrice: 55, taxRate: 0.22 }]);
    });

    it('falls back to every rate when no returned line is on the invoice', () => {
        const lines = creditShares(mixed, 95.2, 'Refund', {
            lines: [{ productId: '64b64c4f4f4f4f4f4f4f4fff', quantity: 1 }],
            shipping: 0
        });

        expect(lines.map((line) => line.unitPrice)).toEqual([24.2, 71]);
    });
});
