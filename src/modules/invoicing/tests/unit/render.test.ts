/**
 * @module
 * Rendering an invoice or a credit note, with the stored copy in front of it. The provider is
 * replaced (no Chromium), the document store is real (a temporary directory), so what is asserted
 * is the behaviour that matters: the second download is the stored file, retention `0` stores
 * nothing, and a store that fails never fails the download.
 */

import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { renderCreditNotePdf, renderInvoicePdf } from '../../services/render';
import { setEnvironment } from '@tests/environment';
import { asStub } from '@tests/stub';
import type { CreditNoteDocument, InvoiceDocument } from '../../model';
import * as documentStore from '@infrastructure/adapters/document-store';

const issue = jest.fn();

jest.mock('../../providers', () => ({
    resolveEInvoicingProvider: () => ({ issue: (document: unknown) => issue(document) })
}));

let root: string;

beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'invoicing-render-'));
    setEnvironment({ NODE_DOCUMENT_STORE_PATH: root });
    setEnvironment({ NODE_INVOICE_PDF_RETENTION_DAYS: '30' });
    issue.mockReset();
    // A distinct body per call, so "the stored one" and "a fresh one" can be told apart.
    let calls = 0;
    issue.mockImplementation(() => {
        calls += 1;
        return Promise.resolve({ bytes: Buffer.from(`pdf-${String(calls)}`) });
    });
});

afterEach(async () => {
    jest.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
});

/** The names in the store, sorted. */
const storedNames = (): Promise<string[]> => readdir(root).then((names) => names.toSorted());

/** A frozen invoice, as far as the renderer reads one. */
const anInvoice = (id: string) =>
    asStub<InvoiceDocument>({
        _id: id,
        number: 'INV-1',
        lines: [],
        seller: {},
        taxSummary: []
    });

/** A frozen credit note, as far as the renderer reads one. */
const aCreditNote = (id: string) =>
    asStub<CreditNoteDocument>({
        _id: id,
        number: 'CN-1',
        invoiceNumber: 'INV-1',
        lines: [],
        seller: {},
        taxSummary: []
    });

describe('the stored copy of a rendered invoice', () => {
    it('renders on the first download, and streams the stored file on the second', async () => {
        const invoice = anInvoice('a'.repeat(24));

        const first = await renderInvoicePdf(invoice);
        const second = await renderInvoicePdf(invoice);

        expect(issue).toHaveBeenCalledTimes(1);
        expect(second.toString()).toBe(first.toString());
    });

    it('stores it under a name carrying the document’s own id, so two invoices never share one', async () => {
        await renderInvoicePdf(anInvoice('a'.repeat(24)));
        await renderInvoicePdf(anInvoice('b'.repeat(24)));

        expect(await storedNames()).toEqual([
            `invoice-${'a'.repeat(24)}.pdf`,
            `invoice-${'b'.repeat(24)}.pdf`
        ]);
        expect(issue).toHaveBeenCalledTimes(2);
    });

    it('keeps a credit note in the same store, apart from the invoice', async () => {
        const id = 'c'.repeat(24);
        await renderInvoicePdf(anInvoice(id));
        await renderCreditNotePdf(aCreditNote(id));
        await renderCreditNotePdf(aCreditNote(id));

        expect(await storedNames()).toEqual([`credit-note-${id}.pdf`, `invoice-${id}.pdf`]);
        // Two renders: the invoice, and the credit note's first. Its second came from disk.
        expect(issue).toHaveBeenCalledTimes(2);
    });

    it('renders again once the file has been reaped', async () => {
        const invoice = anInvoice('d'.repeat(24));
        await renderInvoicePdf(invoice);
        await rm(path.join(root, `invoice-${'d'.repeat(24)}.pdf`));

        await renderInvoicePdf(invoice);

        expect(issue).toHaveBeenCalledTimes(2);
    });
});

describe('a retention of 0', () => {
    it('stores nothing, and renders every download', async () => {
        setEnvironment({ NODE_INVOICE_PDF_RETENTION_DAYS: '0' });
        const invoice = anInvoice('e'.repeat(24));

        await renderInvoicePdf(invoice);
        await renderInvoicePdf(invoice);

        expect(issue).toHaveBeenCalledTimes(2);
        expect(await readdir(root)).toEqual([]);
    });
});

describe('a store that fails', () => {
    // A document store is an optimisation. A full disk or a bad mount must not turn an invoice
    // download into a 500.
    it('still answers the download when the file cannot be written', async () => {
        jest.spyOn(documentStore, 'writeDocument').mockRejectedValue(new Error('disk full'));

        const bytes = await renderInvoicePdf(anInvoice('f'.repeat(24)));

        expect(bytes.toString()).toBe('pdf-1');
    });

    it('renders instead when the stored file cannot be read', async () => {
        jest.spyOn(documentStore, 'readDocument').mockRejectedValue(new Error('EIO'));

        const bytes = await renderInvoicePdf(anInvoice('9'.repeat(24)));

        expect(bytes.toString()).toBe('pdf-1');
    });
});
