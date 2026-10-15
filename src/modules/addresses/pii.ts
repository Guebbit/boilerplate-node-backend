/**
 * @module
 * Encrypts and decrypts one address-book entry's PII fields —
 * fullName/street/city/zip/country/phone, the fields GDPR calls out specifically. `./repository`
 * is the one caller of both directions: `encryptAddressItem` covers the two writes that place a
 * whole entry (`create`'s seed path, `addEntry`), and `decryptAddressItem` covers every reader
 * (`addresses/service.ts`'s wire mapping, `cart/services/checkout.ts`'s order snapshot). Neither
 * helper fits `updateEntry`, which encrypts only the fields a `PATCH` actually changed — that stays
 * inline, one `if` per field, in `./repository`.
 */

import { encryptPii, decryptPii } from '@infrastructure/security/pii-encryption';
import type { Types } from 'mongoose';
import type { AddressItem } from './model';

/** The PII fields every entry must have, in the order they are reported. */
export const REQUIRED_PII_FIELDS = ['fullName', 'street', 'city', 'zip', 'country'] as const;

/**
 * Every PII field of an entry — the one list encrypt, decrypt, update and re-encrypt all walk, so a
 * new field cannot be stored in plaintext by missing one of them. `phone` alone is optional.
 */
export const ADDRESS_PII_FIELDS = [...REQUIRED_PII_FIELDS, 'phone'] as const;

/**
 * The PII fields shared by a stored entry and an incoming write — `AddressItem` and the
 * contract's `AddressInput` alike carry these under the same names.
 */
type AddressPiiFields = Pick<AddressItem, (typeof ADDRESS_PII_FIELDS)[number]>;

/**
 * `item` with each PII field it holds passed through `transform` — a new object, the rest of the
 * entry untouched. An absent `phone` stays absent.
 */
const mapPiiFields = <T extends AddressPiiFields>(
    item: T,
    transform: (field: keyof AddressPiiFields, value: string) => string
): T => ({
    ...item,
    ...Object.fromEntries(
        ADDRESS_PII_FIELDS.flatMap((field) => {
            const value = item[field];
            return value === undefined ? [] : [[field, transform(field, value)]];
        })
    )
});

/**
 * The associated data binding one field of one entry: a ciphertext copied to another entry or
 * another field fails its auth tag.
 */
export const addressAad = (
    field: keyof AddressPiiFields,
    entryId: Types.ObjectId | string
): string => `addressbooks:items.${field}:${String(entryId)}`;

/**
 * One entry, its PII fields encrypted — a new object, everything else on `item` (label, default)
 * untouched, and `_id` set to `entryId`. Generic over `T` so it fits both a stored `AddressItem`
 * and an incoming `AddressInput`.
 *
 * @param entryId - the entry's own `_id`, assigned BEFORE encrypting because it is in the AAD
 */
export const encryptAddressItem = <T extends AddressPiiFields>(
    item: T,
    entryId: Types.ObjectId
): T & { _id: Types.ObjectId } => ({
    ...mapPiiFields(item, (field, value) => encryptPii(value, addressAad(field, entryId))),
    _id: entryId
});

/**
 * One field of one entry, encrypted — for `updateEntry`, which re-encrypts only what a `PATCH`
 * changed.
 */
export const encryptAddressField = (
    field: keyof AddressPiiFields,
    plaintext: string,
    entryId: Types.ObjectId | string
): string => encryptPii(plaintext, addressAad(field, entryId));

/**
 * One entry, its PII fields decrypted — a new object, the subdocument's other fields untouched.
 * The entry's `_id` supplies the AAD, so it must be the one the entry was encrypted under.
 */
export const decryptAddressItem = (item: AddressItem): AddressItem => {
    // A stored entry always has an `_id`: `{ _id: true }` in its schema.
    const id = item._id!;
    return mapPiiFields(item, (field, value) =>
        decryptPii(value, addressAad(field, id), `address ${field}`)
    );
};
