/**
 * @module
 * Moves every address-book entry's encrypted fields onto the newest `NODE_PII_ENCRYPTION_KEY`.
 * Run by the ops script `reencrypt`; see `@infrastructure/security/reencrypt`.
 */

import type { EncryptedField } from '@infrastructure/security/reencrypt';
import { getPiiEncryptionKeyRing, piiBinding } from '@infrastructure/security/pii-encryption';
import type { AddressBookDocument } from './model';
import { addressBookRepository } from './repository';
import { addressAad } from './pii';

/** The encrypted fields of an entry, in the order they are reported. */
const ENTRY_FIELDS = ['fullName', 'street', 'city', 'zip', 'country', 'phone'] as const;

/** Every encrypted value one book holds, with the path to write it back to. */
const fieldsOf = (book: AddressBookDocument): EncryptedField[] =>
    book.items.flatMap((entry, index) =>
        ENTRY_FIELDS.flatMap((field) => {
            const stored = entry[field];
            return stored === undefined
                ? []
                : [
                      {
                          path: `items.${String(index)}.${field}`,
                          stored,
                          binding: piiBinding(addressAad(field, entry._id!)),
                          label: `addressbooks.items.${field}`
                      }
                  ];
        })
    );

/**
 * Re-encrypts every address book onto the newest PII key.
 *
 * @param dryRun - count what a real run would move and write nothing
 */
export const reencryptAddressBooks = (dryRun = false) =>
    addressBookRepository.reencrypt({ ring: getPiiEncryptionKeyRing(), fieldsOf }, dryRun);
