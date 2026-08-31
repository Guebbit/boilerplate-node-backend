/**
 * @module
 * The address book — the one collection this module owns outright. Every endpoint answers the
 * whole book (`{ addresses }`), never one entry: the invariant worth seeing after any write is
 * "exactly one default", and that's a property of the list, not of one entry. A slice of
 * `./index`'s service rather than its own — see `./index` for why the account's two aggregates
 * share one namespace.
 */

import { t } from '@infrastructure/i18n';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import type { Address, AddressInput, UpdateAddressRequest } from '@types';
import { addressBookRepository } from '../repository';
import type { AddressBookDocument, AddressItem } from '../model';

/** The book as `openapi.yaml` declares it: `AddressesResponse`, built rather than serialized. */
export interface AddressesView {
    addresses: Address[];
}

/** One stored entry, mapped to the contract's `Address` — `_id` becomes `id`, optionals omitted rather than `undefined`. */
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

/** A whole book, mapped to the wire view — absence and an empty book both answer `{ addresses: [] }`. */
const toView = (book: AddressBookDocument | null): AddressesView => ({
    addresses: (book?.items ?? []).map((item) => toAddress(item))
});

/** Get the user's book. Absence and emptiness are the same state — an empty view, never 404. */
export const addressesGet = (userId: string): Promise<AddressesView> =>
    addressBookRepository.findByUserId(userId).then((book) => toView(book));

/** Add an entry. The repository decides the default slot — see `addEntry`. */
export const addressAdd = (
    userId: string,
    entry: AddressInput
): Promise<ResponseSuccess<AddressesView> | ResponseReject> =>
    addressBookRepository
        .addEntry(userId, { ...entry, default: entry.default ?? false })
        .then((book) => generateSuccess(toView(book), 200, t('account.addresses.added')));

/** Update one entry of the caller's own book; someone else's id is the same 404 as a bogus one. */
export const addressUpdate = (
    userId: string,
    addressId: string,
    changes: UpdateAddressRequest
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
 * `undefined` means the caller keeps no addresses and named none (not required to buy); `null`
 * means they named an entry that isn't theirs or doesn't exist — checkout must refuse this, not
 * silently ship nowhere. Collapsing the two would let a stale id downgrade to "no address".
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

/*
 * No namespace object here. These six are members of `accountService` in `./index`, which is the
 * module's one service handle — see the note there on why `authService`/`addressesService` became
 * a single name.
 */
