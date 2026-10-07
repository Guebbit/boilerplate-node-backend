/**
 * @module
 * The invoice/credit-note document view — `buildDocumentView`. Renders MONEY and a line per item,
 * the place where a formatting slip is read as a billing error by the person least able to check
 * it, adapted from `orders/tests/unit/emails.test.ts`'s own retired `invoiceDocument` suite.
 */
import { buildDocumentView, taxCategoryCode } from '@modules/invoicing/emails';
import type { EInvoicingDocument } from '@modules/invoicing/providers';

/** A single-line, single-rate document — anything simpler risks masking a bug. */
const DOCUMENT: EInvoicingDocument = {
    kind: 'invoice',
    number: '2026-000041',
    issuedAt: new Date('2026-03-01T00:00:00Z'),
    currency: 'EUR',
    locale: 'en',
    orderNumber: '2026-000007',
    seller: {},
    lines: [{ title: 'Widget', quantity: 5, unitPrice: 19.99, taxRate: 0.22 }],
    netTotal: 81.93,
    taxTotal: 18.02,
    shippingNetAmount: 0,
    shippingTaxAmount: 0,
    taxSummary: [{ rate: 0.22, netAmount: 81.93, taxAmount: 18.02, grossAmount: 99.95 }],
    shippingByRate: [],
    grandTotal: 99.95
};

describe('buildDocumentView', () => {
    it('renders one table row per item, with each item"s own title', () => {
        const { rows } = buildDocumentView('en', DOCUMENT).vat as {
            rows: { description: string }[];
        };

        expect(rows).toHaveLength(1);
        expect(rows[0].description).toBe('Widget');
    });

    it('names the document number in its title metadata', () => {
        const meta = buildDocumentView('en', DOCUMENT).pageMetaTitle as string;

        expect(meta).toContain('2026-000041');
    });

    it('carries the locale and translates by it', () => {
        const english = buildDocumentView('en', DOCUMENT);
        const italian = buildDocumentView('it', DOCUMENT);

        expect(english.locale).toBe('en');
        expect(italian.locale).toBe('it');
        expect(italian.title).not.toBe(english.title);
    });

    it("never re-resolves a line's title through `t()`, even one that collides with a real key", () => {
        const collidingTitle = 'invoicing.document.title';
        const document: EInvoicingDocument = {
            ...DOCUMENT,
            lines: [{ title: collidingTitle, quantity: 1, unitPrice: 1, taxRate: 0.22 }]
        };

        const rowsOf = (locale: string) =>
            (buildDocumentView(locale, document).vat as { rows: { description: string }[] }).rows;

        expect(rowsOf('en')[0].description).toBe(collidingTitle);
        expect(rowsOf('it')[0].description).toBe(collidingTitle);
    });

    it('titles itself an invoice, and a credit note a credit note', () => {
        const invoice = buildDocumentView('en', DOCUMENT).title as string;
        const creditNote = buildDocumentView('en', { ...DOCUMENT, kind: 'creditNote' })
            .title as string;

        expect(invoice).toBe('Invoice');
        expect(creditNote).toBe('Credit note');
    });

    it('prints a reversal notice naming the invoice it corrects, only on a credit note', () => {
        const invoice = buildDocumentView('en', DOCUMENT).reversalNotice;
        const creditNote = buildDocumentView('en', {
            ...DOCUMENT,
            kind: 'creditNote',
            reversalOf: { number: '2026-000041' }
        }).reversalNotice as string;

        expect(invoice).toBeUndefined();
        expect(creditNote).toContain('2026-000041');
    });

    it('carries the frozen billing address, or omits the block entirely', () => {
        const withAddress = buildDocumentView('en', {
            ...DOCUMENT,
            billingAddress: {
                fullName: 'Ada Lovelace',
                street: '1 Analytical Engine Way',
                city: 'London',
                zip: 'W1A 1AA',
                country: 'GB'
            }
        }).billing as { fullName: string; lines: string[] } | undefined;
        const withoutAddress = buildDocumentView('en', DOCUMENT).billing;

        expect(withAddress?.fullName).toBe('Ada Lovelace');
        expect(withAddress?.lines).toContain('1 Analytical Engine Way');
        expect(withoutAddress).toBeUndefined();
    });
});

describe('buildDocumentView — the VAT block', () => {
    it("re-derives each line's net/tax/gross from its own frozen unitPrice/taxRate/quantity, never a float multiply", () => {
        // 19.99 × 5 is 99.94999999999999 in IEEE 754, not 99.95 — a naive re-multiply here would
        // print a wrong gross even though the order-level total (frozen, never recomputed) is right.
        const vat = buildDocumentView('en', DOCUMENT).vat as {
            rows: { grossAmount: string; netAmount: string; taxAmount: string }[];
        };

        expect(vat.rows[0].grossAmount).toBe('€99.95');
    });

    it('formats every amount through Intl.NumberFormat, not a raw number', () => {
        const vat = buildDocumentView('en', DOCUMENT).vat as {
            rows: {
                unitPrice: string;
                netAmount: string;
                taxAmount: string;
                grossAmount: string;
            }[];
            netTotal: string;
            taxTotal: string;
            grandTotal: string;
        };

        for (const value of [
            vat.rows[0].unitPrice,
            vat.rows[0].netAmount,
            vat.rows[0].taxAmount,
            vat.rows[0].grossAmount,
            vat.netTotal,
            vat.taxTotal,
            vat.grandTotal
        ])
            expect(typeof value).toBe('string');
    });

    it('has no shipping table when the document carries no shipping-by-rate rows', () => {
        const vat = buildDocumentView('en', DOCUMENT).vat as { shipping?: unknown };

        expect(vat.shipping).toBeUndefined();
    });

    it('has one shipping row per rate frozen onto `shippingByRate`', () => {
        const document: EInvoicingDocument = {
            ...DOCUMENT,
            shippingByRate: [
                { rate: 0.22, netAmount: 4.1, taxAmount: 0.9, grossAmount: 5 },
                { rate: 0.1, netAmount: 2.73, taxAmount: 0.27, grossAmount: 3 }
            ]
        };
        const vat = buildDocumentView('en', document).vat as {
            shipping?: { rows: { taxRateLabel: string }[] };
        };

        expect(vat.shipping?.rows).toHaveLength(2);
        expect(vat.shipping?.rows.map((row) => row.taxRateLabel).toSorted()).toEqual([
            '10%',
            '22%'
        ]);
    });

    it("formats every amount in the document's own frozen currency", () => {
        const document: EInvoicingDocument = { ...DOCUMENT, currency: 'GBP' };
        const vat = buildDocumentView('en', document).vat as { grandTotal: string };

        expect(vat.grandTotal).toBe('£99.95');
    });

    it('prints the VAT number line, or says plainly that none is configured', () => {
        const withVat = buildDocumentView('en', {
            ...DOCUMENT,
            seller: { vatNumber: 'IT12345678901' }
        }).vat as { supplier: { vatNumberLine: string } };
        const withoutVat = buildDocumentView('en', DOCUMENT).vat as {
            supplier: { vatNumberLine: string };
        };

        expect(withVat.supplier.vatNumberLine).toContain('IT12345678901');
        expect(withoutVat.supplier.vatNumberLine).toMatch(/not configured/i);
    });
});

describe('taxCategoryCode — EN 16931 category, C4', () => {
    it('is S for any non-zero rate, regardless of rateType', () => {
        expect(taxCategoryCode(0.22, undefined)).toBe('S');
        expect(taxCategoryCode(0.1, 'exempt')).toBe('S');
    });

    it('is Z for a 0% rate with no rateType, or an explicit zero-rated', () => {
        expect(taxCategoryCode(0, undefined)).toBe('Z');
        expect(taxCategoryCode(0, 'zero-rated')).toBe('Z');
    });

    it('is E for a 0% rate marked exempt', () => {
        expect(taxCategoryCode(0, 'exempt')).toBe('E');
    });
});

describe('buildDocumentView — the VAT table’s category column, C4', () => {
    it('prints Z and E on their own lines, never the same code for both', () => {
        const document: EInvoicingDocument = {
            ...DOCUMENT,
            lines: [
                {
                    title: 'Zero-rated widget',
                    quantity: 1,
                    unitPrice: 10,
                    taxRate: 0,
                    rateType: 'zero-rated'
                },
                {
                    title: 'Exempt widget',
                    quantity: 1,
                    unitPrice: 10,
                    taxRate: 0,
                    rateType: 'exempt'
                }
            ]
        };

        const vat = buildDocumentView('en', document).vat as {
            rows: { categoryCode: string }[];
        };

        expect(vat.rows.map((row) => row.categoryCode)).toEqual(['Z', 'E']);
    });

    it('labels the category column, in the document’s own locale', () => {
        const english = buildDocumentView('en', DOCUMENT).vat as { columns: { category: string } };
        const italian = buildDocumentView('it', DOCUMENT).vat as { columns: { category: string } };

        expect(english.columns.category).toBe('VAT category');
        expect(italian.columns.category).not.toBe(english.columns.category);
    });
});

describe('buildDocumentView — net unit price and once-per-rate VAT, worked example', () => {
    /** 19.90 x 2 at 22% and 5.50 x 3 at 10%, 6.00 shipping — see `orders/tests/unit/tax.test.ts`. */
    const MIXED: EInvoicingDocument = {
        ...DOCUMENT,
        lines: [
            { title: 'Widget', quantity: 2, unitPrice: 19.9, taxRate: 0.22 },
            { title: 'Gadget', quantity: 3, unitPrice: 5.5, taxRate: 0.1 }
        ],
        shippingNetAmount: 5.09,
        shippingTaxAmount: 0.91,
        netTotal: 47.61,
        taxTotal: 9.6,
        grandTotal: 62.3,
        taxSummary: [
            { rate: 0.1, netAmount: 16.59, taxAmount: 1.66, grossAmount: 18.25 },
            { rate: 0.22, netAmount: 36.11, taxAmount: 7.94, grossAmount: 44.05 }
        ],
        shippingByRate: [
            { rate: 0.1, netAmount: 1.6, taxAmount: 0.15, grossAmount: 1.75 },
            { rate: 0.22, netAmount: 3.49, taxAmount: 0.76, grossAmount: 4.25 }
        ]
    };

    it('prints the unit price EXCLUSIVE of VAT (Art. 226(8)), to two places beyond the cent', () => {
        // 19.90 / 1.22 = 16.311475..., 5.50 / 1.10 = 5.00 exactly.
        const vat = buildDocumentView('en', MIXED).vat as { rows: { unitPrice: string }[] };

        expect(vat.rows.map((row) => row.unitPrice)).toEqual(['€16.3115', '€5.00']);
    });

    it('labels the column as excluding VAT', () => {
        const vat = buildDocumentView('en', MIXED).vat as { columns: { unitPrice: string } };

        expect(vat.columns.unitPrice).toBe('Unit price (excl. VAT)');
    });

    it("prints each line's share of its rate's one rounded goods VAT, adding up to the frozen totals", () => {
        // Goods VAT frozen: 22% = 7.94 - 0.76 = 7.18, 10% = 1.66 - 0.15 = 1.51 — one line each.
        const vat = buildDocumentView('en', MIXED).vat as {
            rows: { netAmount: string; taxAmount: string; grossAmount: string }[];
        };

        expect(vat.rows).toEqual([
            expect.objectContaining({
                netAmount: '€32.62',
                taxAmount: '€7.18',
                grossAmount: '€39.80'
            }),
            expect.objectContaining({
                netAmount: '€14.99',
                taxAmount: '€1.51',
                grossAmount: '€16.50'
            })
        ]);
    });

    it('a currency with no minor unit (JPY) prints a whole-yen net unit price with no fraction', () => {
        // 108 yen at 8% -> 100 exactly; the extra places only appear when the value needs them.
        const vat = buildDocumentView('en', {
            ...DOCUMENT,
            currency: 'JPY',
            lines: [{ title: 'Widget', quantity: 1, unitPrice: 108, taxRate: 0.08 }],
            taxSummary: [{ rate: 0.08, netAmount: 100, taxAmount: 8, grossAmount: 108 }]
        }).vat as { rows: { unitPrice: string }[] };

        expect(vat.rows[0].unitPrice).toBe('¥100');
    });
});
