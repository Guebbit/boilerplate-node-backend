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
export const presentAddress = (item: AddressItem): Address => ({
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

/**
 * One entry of a book, on the wire — for an answer about the address written, not the whole book.
 *
 * @param book - the book after the write
 * @param addressId - the entry's id
 * @returns the entry, or `undefined` when the book holds none by that id
 */
export const presentAddressOf = (
    book: AddressBookDocument | null,
    addressId: string
): Address | undefined => {
    const item = book?.items.find((entry) => String(entry._id) === addressId);
    return item ? presentAddress(item) : undefined;
};

/** A whole book, mapped to the wire view — absence and an empty book both answer `{ addresses: [] }`. */
export const presentAddresses = (book: AddressBookDocument | null): AddressesView => ({
    addresses: (book?.items ?? []).map((item) => presentAddress(item))
});
