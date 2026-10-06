/**
 * @module
 * Encrypts the buyer's address frozen on an invoice or a credit note — twin of the orders
 * module's codec,
 * same `NODE_PII_ENCRYPTION_KEY` ring. The document stays whole as the legal copy; only its
 * storage is protected (GDPR Art. 32).
 *
 * Writes: `issue-invoice.ts` and `issue-credit-note.ts`, under the new document's pre-allocated `_id`.
 * Reads:  `render.ts` alone, the one place the plaintext is needed.
 */

import type { Types } from 'mongoose';
import { encryptPii, decryptPii } from '@infrastructure/security/pii-encryption';
import type { InvoiceParty } from './model';

/** Which collection a document lives in; part of the AAD, so an invoice's address cannot pose as a credit note's. */
export type InvoiceDocumentKind = 'invoice' | 'credit-note';

/** The party's fields, walked by both directions. */
export const PARTY_FIELDS = ['fullName', 'street', 'city', 'zip', 'country'] as const;

/** The associated data binding one field of one document's address. */
export const partyAad = (
    kind: InvoiceDocumentKind,
    field: (typeof PARTY_FIELDS)[number],
    documentId: string
): string => `invoicing:${kind}.billingAddress.${field}:${documentId}`;

/**
 * Rewrites every field of one party with `convert`.
 *
 * @param convert - receives the stored value and its field name
 */
const mapParty = (
    party: InvoiceParty,
    convert: (value: string, field: (typeof PARTY_FIELDS)[number]) => string
): InvoiceParty => ({
    fullName: convert(party.fullName, 'fullName'),
    street: convert(party.street, 'street'),
    city: convert(party.city, 'city'),
    zip: convert(party.zip, 'zip'),
    country: convert(party.country, 'country')
});

/**
 * A party encrypted for storage on one document.
 *
 * @param documentId - the document's own `_id`, pre-allocated before the insert
 */
export const encryptInvoiceParty = (
    party: InvoiceParty,
    kind: InvoiceDocumentKind,
    documentId: Types.ObjectId
): InvoiceParty =>
    mapParty(party, (value, field) => encryptPii(value, partyAad(kind, field, String(documentId))));

/**
 * A stored party decrypted.
 *
 * @param documentId - the `_id` of the document that holds it
 */
export const decryptInvoiceParty = (
    party: InvoiceParty,
    kind: InvoiceDocumentKind,
    documentId: Types.ObjectId
): InvoiceParty =>
    mapParty(party, (value, field) =>
        decryptPii(value, partyAad(kind, field, String(documentId)), `${kind} ${field}`)
    );
