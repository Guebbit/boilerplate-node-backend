/**
 * @module
 * The address book — the one collection this module owns. A write to one entry answers that entry
 * (what a create, PUT or PATCH describes); the list and a removal answer the whole book, since
 * "exactly one default" is a property of the list. A write that moves the default changes another
 * row too, so a client showing the book refetches it.
 */

import type { ClientSession } from 'mongoose';
import { t } from '@infrastructure/i18n';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import type { Address, AddressInput, UpdateAddressRequest } from '@types';
import { addressBookRepository, ADDRESS_BOOK_FULL } from './repository';
import { ERROR_CODES } from '@api/error-codes';
import type { AddressItem } from './model';
import {
    presentAddress,
    presentAddressOf,
    presentAddresses,
    type AddressesView
} from './presenter';

import { reencryptAddressBooks } from './reencrypt';

/** Get the user's book. Absence and emptiness are the same state — an empty view, never 404. */
const list = (userId: string): Promise<AddressesView> =>
    addressBookRepository.findByUserId(userId).then((book) => presentAddresses(book));

/**
 * Add an entry. The repository decides the default slot — see `addEntry`. Answers the entry it
 * created, 201, or 409 `ADDRESS_BOOK_FULL` once the book holds `NODE_ADDRESS_BOOK_MAX`.
 */
const create = (
    userId: string,
    entry: AddressInput
): Promise<ResponseSuccess<Address> | ResponseReject> =>
    addressBookRepository.addEntry(userId, entry).then((book) => {
        if (book === ADDRESS_BOOK_FULL)
            return generateReject(409, [
                { code: ERROR_CODES.ADDRESS_BOOK_FULL, message: t('addresses.book-full') }
            ]);
        // `addEntry` appends, so the entry just written is the last one — never absent.
        const added = book.items.at(-1)!;
        return generateSuccess(presentAddress(added), 201, t('addresses.added'));
    });

/**
 * Update one entry of the caller's own book; someone else's id is the same 404 as a bogus one.
 * Answers the entry as it now stands.
 */
const update = (
    userId: string,
    addressId: string,
    changes: UpdateAddressRequest
): Promise<ResponseSuccess<Address> | ResponseReject> =>
    addressBookRepository.updateEntry(userId, addressId, changes).then((book) => {
        const address = presentAddressOf(book, addressId);
        if (!address) return generateReject(404, [t('addresses.not-found')]);
        return generateSuccess(address, 200, t('addresses.updated'));
    });

/**
 * Make one entry the book's default, demoting the holder. Answers the entry, now `default: true`;
 * the demoted one is a different row, so a client that shows the book refetches it.
 */
const setDefault = (
    userId: string,
    addressId: string
): Promise<ResponseSuccess<Address> | ResponseReject> =>
    addressBookRepository.setDefault(userId, addressId).then((book) => {
        const address = presentAddressOf(book, addressId);
        if (!address) return generateReject(404, [t('addresses.not-found')]);
        return generateSuccess(address, 200, t('addresses.default-set'));
    });

/** Remove one entry; the repository keeps the one-default invariant. */
const remove = (
    userId: string,
    addressId: string
): Promise<ResponseSuccess<AddressesView> | ResponseReject> =>
    addressBookRepository.removeEntry(userId, addressId).then((book) => {
        if (!book) return generateReject(404, [t('addresses.not-found')]);
        return generateSuccess(presentAddresses(book), 200, t('addresses.removed'));
    });

/**
 * The address a checkout should ship to — a named entry, the default, or nothing.
 * `undefined` means the caller keeps no addresses and named none (not required to buy); `null`
 * means they named an entry that isn't theirs or doesn't exist — checkout must refuse this, not
 * silently ship nowhere. Collapsing the two would let a stale id downgrade to "no address".
 */
const forCheckout = (userId: string, addressId?: string): Promise<AddressItem | null | undefined> =>
    addressBookRepository.findByUserId(userId).then((book) => {
        if (addressId !== undefined)
            return book?.items.find((item) => String(item._id) === addressId) ?? null;
        return book?.items.find((item) => item.default) ?? undefined;
    });

/**
 * What a hard account deletion owes the book — the `personalData.erase` hook (see
 * `module.ts`'s manifest), joining the caller's own hard-delete transaction.
 */
const removeByUserId = (userId: string, session: ClientSession): Promise<void> =>
    addressBookRepository.deleteByUserId(userId, session);

/**
 * What an inactive account owes the book — the `personalData.minimise` hook. The same delete as
 * {@link removeByUserId}, with no transaction to join; deleting nothing twice is a no-op,
 * so a retried run is safe.
 *
 * @param userId - the inactive account's id
 */
const minimise = (userId: string): Promise<void> => addressBookRepository.deleteByUserId(userId);

/** The module's one door — every controller and sibling reads and writes the address book through this. */
export const addressService = {
    list,
    create,
    update,
    setDefault,
    remove,
    forCheckout,
    removeByUserId,
    minimise,
    reencrypt: reencryptAddressBooks
};
