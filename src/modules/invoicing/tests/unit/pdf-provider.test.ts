/**
 * @module
 * The shipped PDF provider's real HTML: the EJS template the buyer's PDF is printed from, with the
 * browser replaced so the markup can be read. The view-model test (`emails.test.ts`) proves the
 * strings exist; this proves the template actually prints them.
 */

import { pdfEInvoicingProvider } from '../../providers/pdf';
import type { EInvoicingDocument } from '../../providers';

/** What the stand-in browser was asked to print. */
const printed = jest.fn<Promise<Uint8Array>, [string, Record<string, unknown>?]>();

jest.mock('@infrastructure/adapters/pdf', () => ({
    renderHtmlToPdf: (html: string, options?: Record<string, unknown>) => printed(html, options)
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

    it('prints every legal field of an invoice, with the order number', async () => {
        const html = await htmlOf(DOCUMENT);

        for (const field of [
            'Invoice',
            '2026-000042',
            'March 1, 2026',
            '2026-000007',
            'Acme S.r.l.',
            'Via Roma 2, 20100 Milano',
            'Rossi Srl',
            'Via Roma 1',
            '20100 Milano',
            'Buyer VAT number: IT01234567890',
            'Widget',
            '<span class="chip">S</span>',
            '22%',
            '€10.00',
            '€2.20',
            '€12.20',
            'Unit price (excl. VAT)',
            'Taxed at 22%',
            'Net total',
            'VAT total',
            'Grand total'
        ]) {
            expect(html).toContain(field);
        }
        expect(html).toContain('VAT number not configured');
    });

    it('prints the shipping breakdown only when the document has shipping', async () => {
        const without = await htmlOf(DOCUMENT);
        printed.mockClear();
        const withShipping = await htmlOf({
            ...DOCUMENT,
            shippingByRate: [
                { rate: 0.22, netAmount: '8.11', taxAmount: '1.79', grossAmount: '9.90' }
            ]
        });

        expect(without).not.toContain('Shipping');
        for (const field of ['Shipping, taxed at 22%', '€8.11', '€1.79', '€9.90']) {
            expect(withShipping).toContain(field);
        }
        expect(withShipping).toContain('>Shipping</th>');
    });

    it('carries the logo as a data: URI and fetches nothing from the network', async () => {
        const html = await htmlOf(DOCUMENT);

        expect(html).toMatch(
            /<img class="logo" alt="" src="data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+">/
        );
        expect(html).not.toMatch(/(?:src|href)="https?:/);
    });

    it('prints the reversal banner on a credit note and never on an invoice', async () => {
        const invoice = await htmlOf(DOCUMENT);
        printed.mockClear();
        const creditNote = await htmlOf({
            ...DOCUMENT,
            kind: 'creditNote',
            reversalOf: { number: '2026-000041', reason: 'refund' }
        });

        expect(creditNote).toContain(
            'class="notice">This credit note reverses invoice 2026-000041.'
        );
        expect(invoice).not.toContain('class="notice"');
    });

    it('says the buyer was erased where the address would be', async () => {
        const html = await htmlOf({
            ...DOCUMENT,
            billingAddress: undefined,
            buyerErasedAt: new Date('2026-04-01T00:00:00Z')
        });

        expect(html).toContain('personal data was removed');
        expect(html).not.toContain('Rossi Srl');
    });

    it('prints backgrounds, which the notice, chips and totals card are made of', async () => {
        await pdfEInvoicingProvider.render(DOCUMENT);

        expect(printed.mock.calls[0][1]).toMatchObject({ format: 'A4', printBackground: true });
    });

    it('repeats the seller, VAT number and document number in the page footer, escaped', async () => {
        await pdfEInvoicingProvider.render({
            ...DOCUMENT,
            seller: { ...DOCUMENT.seller, legalName: 'Smith & <Sons>' }
        });

        const options = printed.mock.calls[0][1] as {
            displayHeaderFooter: boolean;
            footerTemplate: string;
        };
        expect(options.displayHeaderFooter).toBe(true);
        expect(options.footerTemplate).toContain(
            'Smith &amp; &lt;Sons&gt; · VAT number not configured · Invoice 2026-000042'
        );
    });

    it('retries the logo read after a failed one instead of keeping the failure', async () => {
        const readFile = jest
            .fn()
            .mockRejectedValueOnce(new Error('disk gone'))
            .mockResolvedValue('PHN2Zz48L3N2Zz4=');
        let provider!: typeof pdfEInvoicingProvider;
        // A fresh copy of the provider, so its memoised logo starts empty; only `readFile` is swapped.
        await jest.isolateModulesAsync(async () => {
            jest.doMock('node:fs/promises', () => ({
                ...jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises'),
                readFile
            }));
            ({ pdfEInvoicingProvider: provider } = await import('../../providers/pdf'));
        });

        await expect(provider.render(DOCUMENT)).rejects.toThrow('disk gone');
        expect(printed).not.toHaveBeenCalled();
        await provider.render(DOCUMENT);

        expect(readFile).toHaveBeenCalledTimes(2);
        expect(printed.mock.calls[0][0]).toContain(
            'src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="'
        );
        jest.dontMock('node:fs/promises');
    });
});
