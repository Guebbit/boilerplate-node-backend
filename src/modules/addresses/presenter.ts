/**
 * @module
 * The one place an address-book document becomes the wire shape `openapi.yaml` declares. Every
 * endpoint in `./service.ts` answers with this same view — see that file's own header for why the
 * whole book, never one entry.
 */

import type { Address } from '@types';
import type { AddressBookDocument, AddressItem } from './model';

/** The book as `openapi.yaml` declares it: `AddressesResponse`, built rather than serialized. */
export interface AddressesView {
    addresses: Address[];
}

/** One stored entry, mapped to the contract's `Address` — `_id` becomes `id`, optionals omitted rather than `undefined`. */
const presentAddress = (item: AddressItem): Address => ({
    id: String(item._id),
    ...(item.label === undefined ? {} : { label: item.label }),
    fullName: item.fullName,
    street: item.street,
    city: item.city,
    zip: item.zip,
    country: item.country,
    ...(item.phone === undefined ? {} : { phone: item.phone }),
    default: item.default
});

/** A whole book, mapped to the wire view — absence and an empty book both answer `{ addresses: [] }`. */
export const presentAddresses = (book: AddressBookDocument | null): AddressesView => ({
    addresses: (book?.items ?? []).map((item) => presentAddress(item))
});
