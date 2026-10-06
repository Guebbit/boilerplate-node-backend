/**
 * @module
 * Moves the buyer address frozen on every invoice and credit note onto the newest
 * `NODE_PII_ENCRYPTION_KEY`. Run by the ops script `reencrypt`; see
 * `@infrastructure/security/reencrypt`.
 */

import { mergeReports, type EncryptedField } from '@infrastructure/security/reencrypt';
import { getPiiEncryptionKeyRing, piiBinding } from '@infrastructure/security/pii-encryption';
import type { FrozenTaxDocument } from '../model';
import { invoicingRepository } from '../repository';
import { PARTY_FIELDS, partyAad, type InvoiceDocumentKind } from '../pii';

/** The encrypted values of one document's `billingAddress`, bound to the document's own `_id`. */
const partyFields = (
    kind: InvoiceDocumentKind,
    document: FrozenTaxDocument & { _id: unknown }
): EncryptedField[] =>
    PARTY_FIELDS.flatMap((field) => {
        const stored = document.billingAddress?.[field];
        return stored === undefined
            ? []
            : [
                  {
                      path: `billingAddress.${field}`,
                      stored,
                      binding: piiBinding(partyAad(kind, field, String(document._id))),
                      label: `${kind}.billingAddress.${field}`
                  }
              ];
    });

/**
 * Re-encrypts every invoice's and credit note's buyer address onto the newest PII key.
 *
 * @param dryRun - count what a real run would move and write nothing
 * @returns the two collections' reports, merged
 */
export const reencryptInvoices = (dryRun = false) => {
    const ring = getPiiEncryptionKeyRing();
    const filter = { billingAddress: { $exists: true } };
    return Promise.all([
        invoicingRepository.reencryptInvoices(
            {
                filter,
                ring,
                fieldsOf: (invoice) => partyFields('invoice', invoice)
            },
            dryRun
        ),
        invoicingRepository.reencryptCreditNotes(
            {
                filter,
                ring,
                fieldsOf: (note) => partyFields('credit-note', note)
            },
            dryRun
        )
    ]).then(([invoices, notes]) => mergeReports(invoices, notes));
};
