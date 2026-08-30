/**
 * How an address-book fixture is built.
 *
 * A book is addressed by its owner — `addressBooks.userId` is `unique` and no book id reaches the
 * wire — so, like the cart and the wishlist, this pins an `_id` it does not need as a handle. The
 * reason is the same one `../cart/fixtures` gives at length: `scripts/export-demo-dataset.ts` commits what
 * it reads back, and a generated id is 24 different characters on every run.
 *
 * ## Why an ENTRY pins its id too, unlike a cart line
 *
 * A cart line is addressed by its product and carries `_id: false`. An address entry is the
 * opposite case — two entries may hold identical fields and still be "home" and "office", so
 * `addressItemSchema` keeps its `_id` and every endpoint takes that id as its handle. Which means
 * a fixture that let mongod assign them would publish two unstable ids per book instead of one.
 *
 * Entries arrive as the contract's `Address`, the shape `GET /account/addresses` answers with, so
 * a fixture states an entry the way a client would read it back.
 */

import { Types } from 'mongoose';
import { compact, identityOf, type FactoryIdentity } from '@infrastructure/persistence/fixtures';
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

/** The contract's `id` becomes the subdocument's `_id`; absent optionals leave no key behind. */
const toEntry = ({ id, label, phone, ...fields }: Address): AddressItem => ({
    _id: new Types.ObjectId(id),
    ...fields,
    ...compact({ label, phone })
});

export const makeAddressBook = ({
    userId,
    items,
    ...identity
}: AddressBookOverrides): AddressBookFixture => ({
    userId: new Types.ObjectId(userId),
    ...identityOf(identity),
    ...(items === undefined ? {} : { items: items.map((item) => toEntry(item)) })
});
