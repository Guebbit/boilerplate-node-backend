/**
 * @module
 * The shipped PDF provider's real HTML: the EJS template the buyer's PDF is printed from, with the
 * browser replaced so the markup can be read. The view-model test (`emails.test.ts`) proves the
 * strings exist; this proves the template actually prints them.
 */

import { pdfEInvoicingProvider } from '../../providers/pdf';
import type { EInvoicingDocument } from '../../providers';

/** What the stand-in browser was asked to print. */
const printed = jest.fn<Promise<Uint8Array>, [string]>();

jest.mock('@infrastructure/adapters/pdf', () => ({
    renderHtmlToPdf: (html: string) => printed(html)
}));

beforeEach(() => {
    printed.mockReset();
    printed.mockResolvedValue(new Uint8Array());
});

/** A single-line document billed to a business, whose number and VAT number the HTML must carry. */
const DOCUMENT: EInvoicingDocument = {
    kind: 'invoice',
    number: '2026-000042',
    issuedAt: new Date('2026-03-01T00:00:00Z'),
    timezone: 'Europe/Rome',
    currency: 'EUR',
    locale: 'en',
    orderNumber: '2026-000007',
    billingAddress: {
        fullName: 'Rossi Srl',
        street: 'Via Roma 1',
        city: 'Milano',
        zip: '20100',
        country: 'IT',
        vatNumber: 'IT01234567890'
    },
    seller: {
        legalName: 'Acme S.r.l.',
        street: 'Via Roma 2',
        city: 'Milano',
        zip: '20100',
        country: 'IT'
    },
    lines: [{ title: 'Widget', quantity: 1, unitPrice: '12.20', taxRate: 0.22 }],
    netTotal: '10.00',
    taxTotal: '2.20',
    shippingNetAmount: '0.00',
    shippingTaxAmount: '0.00',
    taxSummary: [{ rate: 0.22, netAmount: '10.00', taxAmount: '2.20', grossAmount: '12.20' }],
    shippingByRate: [],
    grandTotal: '12.20'
};

/** The HTML one document renders to. */
const htmlOf = async (document: EInvoicingDocument): Promise<string> => {
    await pdfEInvoicingProvider.render(document);
    return printed.mock.calls[0][0];
};

describe('the invoice template', () => {
    it('prints the buyer VAT number under the buyer, and nothing for a private buyer', async () => {
        const business = await htmlOf(DOCUMENT);
        printed.mockClear();
        const privateBuyer = await htmlOf({
            ...DOCUMENT,
            billingAddress: { ...DOCUMENT.billingAddress!, vatNumber: undefined }
        });

        expect(business).toContain('Buyer VAT number: IT01234567890');
        expect(privateBuyer).not.toContain('Buyer VAT number');
    });

    it('says a correction credit note cancels the invoice it names, and prints the old buyer on it', async () => {
        const html = await htmlOf({
            ...DOCUMENT,
            kind: 'creditNote',
            number: '2026-000003',
            reversalOf: { number: '2026-000041', reason: 'correction' }
        });

        expect(html).toContain('cancels invoice 2026-000041');
        expect(html).toContain('IT01234567890');
        expect(html).not.toContain('reverses invoice');
    });

    it('keeps the refund wording for a credit note that reverses a refund', async () => {
        const html = await htmlOf({
            ...DOCUMENT,
            kind: 'creditNote',
            reversalOf: { number: '2026-000041', reason: 'refund' }
        });

        expect(html).toContain('reverses invoice 2026-000041');
    });
});
