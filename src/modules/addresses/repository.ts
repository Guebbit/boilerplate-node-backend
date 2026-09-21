/**
 * @module
 * Queries for the address book — a read-modify-write repository, not a `$set`/`$pull` one. See
 * the export's own JSDoc below for why.
 */

import { addressBookModel, applyAddressBookTransform } from './model';
import type { AddressBookDocument } from './model';
import type { AddressInput, UpdateAddressRequest } from '@types';
import {
    createRepository,
    toObjectId,
    type Repository
} from '@infrastructure/persistence/create-repository';
import { encryptPii } from '@infrastructure/security/pii-encryption';
import { decryptAddressItem } from './pii';

/**
 * Every book this module hands back is decrypted first — `findByUserId` and every write method's
 * return value alike — so every caller (`addresses/service.ts`'s wire mapping,
 * `cart/services/checkout.ts`'s order snapshot) sees plaintext regardless of whether it asked for
 * a fresh read or the result of its own write. `Object.assign` onto the existing subdocument,
 * not a replaced array: keeps the Mongoose DocumentArray's own methods intact on a document
 * nothing here calls `.save()` on again.
 */
const decryptBook = (book: AddressBookDocument): AddressBookDocument => {
    for (const item of book.items) Object.assign(item, decryptAddressItem(item));
    return book;
};

/**
 * Every write loads the book, edits it in memory and saves — a READ-MODIFY-WRITE, which the cart
 * avoids, because "exactly one default" is an invariant across the WHOLE array and no single
 * `$set`/`$pull` can demote the old default, promote the new one and prune the removed entry
 * atomically. Nobody edits their book from two devices in the same second the way two tabs race
 * a cart, so mongoose's optimistic versioning on `save()` is protection enough — the loser
 * retries by hand.
 *
 * The type is written out because Mongoose's generics are too large for TS to serialize an
 * inferred one at an export boundary (TS7056) — the same reason `Repository` exists.
 */
export const addressBookRepository: Repository<AddressBookDocument> & {
    findByUserId: (userId: string) => Promise<AddressBookDocument | null>;
    addEntry: (userId: string, entry: AddressInput) => Promise<AddressBookDocument>;
    updateEntry: (
        userId: string,
        addressId: string,
        changes: UpdateAddressRequest
    ) => Promise<AddressBookDocument | null>;
    removeEntry: (userId: string, addressId: string) => Promise<AddressBookDocument | null>;
    deleteByUserId: (userId: string) => Promise<void>;
} = {
    ...createRepository<AddressBookDocument>(addressBookModel, {
        transform: applyAddressBookTransform
    }),

    /**
     * Overrides the factory's own `create` — the one write path above doesn't cover:
     * `insertIfAbsentForOwner` (`scenarios/seed.ts`) calls this directly with a plaintext fixture
     * from `makeAddressBook`, never through `addEntry`. Same encrypt-then-decrypt shape as every
     * other write below.
     */
    create: (data) =>
        addressBookModel
            .create({
                ...data,
                items: (data.items ?? []).map((item) => ({
                    ...item,
                    fullName: encryptPii(item.fullName),
                    street: encryptPii(item.street),
                    city: encryptPii(item.city),
                    zip: encryptPii(item.zip),
                    country: encryptPii(item.country),
                    ...(item.phone === undefined ? {} : { phone: encryptPii(item.phone) })
                }))
            })
            .then(decryptBook),

    /**
     * Fetch a user's book. `null` means they never saved an address — the same state as an
     * empty book.
     */
    findByUserId: (userId: string) =>
        addressBookModel
            .findOne({ userId: toObjectId(userId) })
            .exec()
            .then((book) => (book ? decryptBook(book) : book)),

    /**
     * Append one entry, creating the book if the user has none.
     *
     * The default invariant is decided here: the first entry is default regardless of what it
     * asked, a later entry claiming `default: true` demotes the current holder, and a later
     * entry that claims nothing changes nothing.
     */
    addEntry: async (userId: string, entry: AddressInput) => {
        const book =
            (await addressBookModel.findOne({ userId: toObjectId(userId) }).exec()) ??
            new addressBookModel({ userId: toObjectId(userId), items: [] });

        const wantsDefault = (entry.default ?? false) || book.items.length === 0;
        if (wantsDefault) for (const item of book.items) item.default = false;

        book.items.push({
            ...entry,
            fullName: encryptPii(entry.fullName),
            street: encryptPii(entry.street),
            city: encryptPii(entry.city),
            zip: encryptPii(entry.zip),
            country: encryptPii(entry.country),
            ...(entry.phone === undefined ? {} : { phone: encryptPii(entry.phone) }),
            default: wantsDefault
        });
        return book.save().then(decryptBook);
    },

    /**
     * Edit one entry of the caller's own book. Resolves `null` when the book or entry is absent,
     * so the controller answers the same 404 an invented id gets. `default: true` claims the
     * slot; `false`/absent leaves the assignment alone (demoting without a successor would leave
     * the book with none).
     */
    updateEntry: async (userId: string, addressId: string, changes: UpdateAddressRequest) => {
        const book = await addressBookModel.findOne({ userId: toObjectId(userId) }).exec();
        const entry = book?.items.find((item) => String(item._id) === addressId);
        if (!book || !entry) return null;

        if (changes.label !== undefined) entry.label = changes.label;
        if (changes.fullName !== undefined) entry.fullName = encryptPii(changes.fullName);
        if (changes.street !== undefined) entry.street = encryptPii(changes.street);
        if (changes.city !== undefined) entry.city = encryptPii(changes.city);
        if (changes.zip !== undefined) entry.zip = encryptPii(changes.zip);
        if (changes.country !== undefined) entry.country = encryptPii(changes.country);
        if (changes.phone !== undefined) entry.phone = encryptPii(changes.phone);
        if (changes.default === true) {
            for (const item of book.items) item.default = false;
            entry.default = true;
        }

        return book.save().then(decryptBook);
    },

    /**
     * Remove one entry of the caller's own book. Removing the default promotes the oldest
     * remaining entry — a non-empty book always has exactly one default.
     */
    removeEntry: async (userId: string, addressId: string) => {
        const book = await addressBookModel.findOne({ userId: toObjectId(userId) }).exec();
        const entry = book?.items.find((item) => String(item._id) === addressId);
        if (!book || !entry) return null;

        book.items = book.items.filter((item) => String(item._id) !== addressId);
        if (entry.default && book.items.length > 0) book.items[0].default = true;

        return book.save().then(decryptBook);
    },

    /**
     * Delete a user's book outright — what a hard account deletion owes it.
     */
    deleteByUserId: (userId: string) =>
        addressBookModel
            .deleteOne({ userId: toObjectId(userId) })
            .exec()
            .then(() => {
                // explicit void return
            })
};
