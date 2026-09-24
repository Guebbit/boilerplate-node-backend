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
 * One entry, its PII fields encrypted — a new object, everything else on `item` (label, default,
 * an existing `_id`) untouched. Generic over `T` so it fits both a stored `AddressItem` and an
 * incoming `AddressInput`, the two shapes `create` and `addEntry` place whole.
 */
export const encryptAddressItem = <T extends AddressPiiFields>(item: T): T => ({
    ...item,
    fullName: encryptPii(item.fullName),
    street: encryptPii(item.street),
    city: encryptPii(item.city),
    zip: encryptPii(item.zip),
    country: encryptPii(item.country),
    ...(item.phone === undefined ? {} : { phone: encryptPii(item.phone) })
});

/** One entry, its PII fields decrypted — a new object, the subdocument's other fields untouched. */
export const decryptAddressItem = (item: AddressItem): AddressItem => ({
    ...item,
    fullName: decryptPii(item.fullName, 'address fullName'),
    street: decryptPii(item.street, 'address street'),
    city: decryptPii(item.city, 'address city'),
    zip: decryptPii(item.zip, 'address zip'),
    country: decryptPii(item.country, 'address country'),
    ...(item.phone === undefined ? {} : { phone: decryptPii(item.phone, 'address phone') })
});
