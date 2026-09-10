/**
 * @module
 * How an address-book row is built: a book is addressed by its owner (`userId` is `unique`,
 * no book id reaches the wire), so this pins an `_id` it doesn't need so `npm run scenario:build` can
 * publish a stable one run over run. An ENTRY is the opposite: two addresses can be identical in
 * every field and still be different entries, so it keeps its own.
 */

import { Types } from 'mongoose';
import {
    stripUndefined,
    identityOf,
    type FactoryIdentity
} from '@infrastructure/persistence/factories';
import type { Address, Id } from '@types';
import type { AddressBookDocument, AddressItem } from './model';

/** What a caller may pin on a book. */
export interface AddressBookOverrides extends FactoryIdentity {
    /** 24-char hex of the owning user. */
    userId: Id;
    /** Absent leaves the schema's `default: []` to apply — a book with no entries. */
    items?: Address[];
}

/**
 * A book ready for `addressBookRepository.create`.
 *
 * `userId` is required for the same reason the cart's is: a book cannot be built without an owner,
 * and leaving it optional under `Partial` only moves the assertion to the caller.
 */
export type AddressBookFixture = Partial<AddressBookDocument> & Pick<AddressBookDocument, 'userId'>;

/** A book fixture ready for `addressBookRepository.create`, from a caller's overrides. */
export const makeAddressBook = ({
    userId,
    items,
    ...identity
}: AddressBookOverrides): AddressBookFixture => ({
    userId: new Types.ObjectId(userId),
    ...identityOf(identity),
    // The contract's `id` becomes the subdocument's `_id`; absent optionals leave no key behind.
    ...(items === undefined
        ? {}
        : {
              items: items.map(
                  ({ id, label, phone, ...fields }): AddressItem => ({
                      _id: new Types.ObjectId(id),
                      ...fields,
                      ...stripUndefined({ label, phone })
                  })
              )
          })
});
