/**
 * @module
 * The address book — the one collection this module owns. Every endpoint answers the whole book
 * (`{ addresses }`), never one entry: the invariant worth seeing after any write is "exactly one
 * default", and that's a property of the list, not of one entry.
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
import { addressBookRepository } from './repository';
import type { AddressItem } from './model';
import { presentAddressOf, presentAddresses, type AddressesView } from './presenter';

/** Get the user's book. Absence and emptiness are the same state — an empty view, never 404. */
export const addressesGet = (userId: string): Promise<AddressesView> =>
    addressBookRepository.findByUserId(userId).then((book) => presentAddresses(book));

/** Add an entry. The repository decides the default slot — see `addEntry`. */
export const addressAdd = (
    userId: string,
    entry: AddressInput
): Promise<ResponseSuccess<AddressesView> | ResponseReject> =>
    addressBookRepository
        .addEntry(userId, entry)
        .then((book) => generateSuccess(presentAddresses(book), 200, t('addresses.added')));

/** Update one entry of the caller's own book; someone else's id is the same 404 as a bogus one. */
export const addressUpdate = (
    userId: string,
    addressId: string,
    changes: UpdateAddressRequest
): Promise<ResponseSuccess<AddressesView> | ResponseReject> =>
    addressBookRepository.updateEntry(userId, addressId, changes).then((book) => {
        if (!book) return generateReject(404, [t('addresses.not-found')]);
        return generateSuccess(presentAddresses(book), 200, t('addresses.updated'));
    });

/**
 * Make one entry the book's default, demoting the holder. Answers the entry, now `default: true`;
 * the demoted one is a different row, so a client that shows the book refetches it.
 */
export const addressSetDefault = (
    userId: string,
    addressId: string
): Promise<ResponseSuccess<Address> | ResponseReject> =>
    addressBookRepository.setDefault(userId, addressId).then((book) => {
        const address = presentAddressOf(book, addressId);
        if (!address) return generateReject(404, [t('addresses.not-found')]);
        return generateSuccess(address, 200, t('addresses.default-set'));
    });

/** Remove one entry; the repository keeps the one-default invariant. */
export const addressRemove = (
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
export const addressForCheckout = (
    userId: string,
    addressId?: string
): Promise<AddressItem | null | undefined> =>
    addressBookRepository.findByUserId(userId).then((book) => {
        if (addressId !== undefined)
            return book?.items.find((item) => String(item._id) === addressId) ?? null;
        return book?.items.find((item) => item.default) ?? undefined;
    });

/**
 * What a hard account deletion owes the book — DDD-D6's `personalData.erase` hook (see
 * `module.ts`'s manifest), joining the caller's own hard-delete transaction.
 */
export const addressesDeleteByUserId = (userId: string, session: ClientSession): Promise<void> =>
    addressBookRepository.deleteByUserId(userId, session);
