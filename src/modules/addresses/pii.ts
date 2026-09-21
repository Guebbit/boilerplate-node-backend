/**
 * @module
 * Decrypts one address-book entry's PII fields — fullName/street/city/zip/country/phone, the
 * fields GDPR calls out specifically. `./repository` is the one caller: every reader of an
 * `AddressItem` (`addresses/service.ts`'s wire mapping, `cart/services/checkout.ts`'s order
 * snapshot) goes through the repository, so decrypting there once covers both. The write side has
 * no matching helper here — `encryptPii` is called inline at each field assignment in
 * `./repository`, the same shape `updateEntry`'s existing per-field `if` checks already have.
 */

import { decryptPii } from '@infrastructure/security/pii-encryption';
import type { AddressItem } from './model';

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
