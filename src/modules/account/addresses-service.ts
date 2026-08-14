import { t } from '@infrastructure/i18n';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import type { Address } from '@types';
import { addressBookRepository } from './addresses-repository';
import type { AddressBookDocument, AddressItem } from './addresses-model';

/**
 * Address book Service
 *
 * Every endpoint answers the whole book (`{ addresses }`), never one entry: the invariant worth
 * seeing after any write is "exactly one default", and that is a property of the list. A client
 * that wrote one entry and re-rendered only that entry would happily display two defaults.
 */

/** The book as `openapi.yaml` declares it: `AddressesResponse`, built rather than serialized. */
export interface AddressesView {
    addresses: Address[];
}

const toAddress = (item: AddressItem): Address => ({
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

const toView = (book: AddressBookDocument | null): AddressesView => ({
    addresses: (book?.items ?? []).map((item) => toAddress(item))
});

/** Get the user's book. Absence and emptiness are the same state — an empty view, never 404. */
export const addressesGet = (userId: string): Promise<AddressesView> =>
    addressBookRepository.findByUserId(userId).then((book) => toView(book));

/** Add an entry. The repository decides the default slot — see `addEntry`. */
export const addressAdd = (
    userId: string,
    entry: Omit<AddressItem, '_id' | 'default'> & { default?: boolean }
): Promise<ResponseSuccess<AddressesView> | ResponseReject> =>
    addressBookRepository
        .addEntry(userId, { ...entry, default: entry.default ?? false })
        .then((book) => generateSuccess(toView(book), 200, t('account.addresses.added')));

/** Update one entry of the caller's own book; someone else's id is the same 404 as a bogus one. */
export const addressUpdate = (
    userId: string,
    addressId: string,
    changes: Partial<Omit<AddressItem, '_id'>>
): Promise<ResponseSuccess<AddressesView> | ResponseReject> =>
    addressBookRepository.updateEntry(userId, addressId, changes).then((book) => {
        if (!book) return generateReject(404, [t('account.addresses.not-found')]);
        return generateSuccess(toView(book), 200, t('account.addresses.updated'));
    });

/** Remove one entry; the repository keeps the one-default invariant. */
export const addressRemove = (
    userId: string,
    addressId: string
): Promise<ResponseSuccess<AddressesView> | ResponseReject> =>
    addressBookRepository.removeEntry(userId, addressId).then((book) => {
        if (!book) return generateReject(404, [t('account.addresses.not-found')]);
        return generateSuccess(toView(book), 200, t('account.addresses.removed'));
    });

/**
 * The address a checkout should ship to — a named entry, the default, or nothing.
 *
 * Exposed through the barrel for the cart's checkout. `undefined` for "the caller keeps no
 * addresses and named none" (an address is not required to buy), `null` for "the caller NAMED
 * an entry that is not theirs or does not exist" — which the checkout must refuse rather than
 * ship nowhere. The split is the whole return type: collapsing the two would let a stale
 * address id silently downgrade to "no address".
 */
export const addressForCheckout = (
    userId: string,
    addressId?: string
): Promise<AddressItem | null | undefined> =>
    addressBookRepository.findByUserId(userId).then((book) => {
        if (addressId !== undefined)
            return book?.items.find((item) => String(item._id) === addressId) ?? null;
        return book?.items.find((item) => item.default) ?? undefined;
    });

/** What a hard account deletion owes the book — see `module.ts`'s subscription. */
export const addressesDeleteByUserId = (userId: string): Promise<void> =>
    addressBookRepository.deleteByUserId(userId);

export const addressesService = {
    addressesGet,
    addressAdd,
    addressUpdate,
    addressRemove,
    addressForCheckout,
    addressesDeleteByUserId
};
