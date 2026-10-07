/**
 * @module
 * The frozen tax documents' schema contract: an invoice and a credit note both copy the order's
 * own `orderNumber` and `currency`, and neither has a fallback when one is missing.
 */
import { invoiceModel, creditNoteModel } from '@modules/invoicing/model';
import { requiredPaths } from '@tests/schema';

describe.each([
    ['invoiceSchema', invoiceModel.schema],
    ['creditNoteSchema', creditNoteModel.schema]
])('%s — what a frozen tax document must carry', (_name, schema) => {
    it('requires the order number and the currency copied from the order', () => {
        expect(requiredPaths(schema)).toEqual(expect.arrayContaining(['orderNumber', 'currency']));
    });
});
