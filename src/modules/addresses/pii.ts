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

/**
 * The PII fields shared by a stored entry and an incoming write — `AddressItem` and the
 * contract's `AddressInput` alike carry these under the same names.
 */
type AddressPiiFields = Pick<
    AddressItem,
    'fullName' | 'street' | 'city' | 'zip' | 'country' | 'phone'
>;

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
    ...item,
    _id: entryId,
    fullName: encryptPii(item.fullName, addressAad('fullName', entryId)),
    street: encryptPii(item.street, addressAad('street', entryId)),
    city: encryptPii(item.city, addressAad('city', entryId)),
    zip: encryptPii(item.zip, addressAad('zip', entryId)),
    country: encryptPii(item.country, addressAad('country', entryId)),
    ...(item.phone === undefined
        ? {}
        : { phone: encryptPii(item.phone, addressAad('phone', entryId)) })
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
    return {
        ...item,
        fullName: decryptPii(item.fullName, addressAad('fullName', id), 'address fullName'),
        street: decryptPii(item.street, addressAad('street', id), 'address street'),
        city: decryptPii(item.city, addressAad('city', id), 'address city'),
        zip: decryptPii(item.zip, addressAad('zip', id), 'address zip'),
        country: decryptPii(item.country, addressAad('country', id), 'address country'),
        ...(item.phone === undefined
            ? {}
            : { phone: decryptPii(item.phone, addressAad('phone', id), 'address phone') })
    };
};
