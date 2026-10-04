/**
 * @module
 * Queries for the address book — a read-modify-write repository, not a `$set`/`$pull` one. See
 * the export's own JSDoc below for why.
 */

import { Types, type ClientSession } from 'mongoose';
import { addressBookModel, applyAddressBookTransform } from './model';
import type { AddressBookDocument } from './model';
import type { AddressInput, UpdateAddressRequest } from '@types';
import {
    createRepository,
    toObjectId,
    type Repository,
    type Wire
} from '@infrastructure/persistence/create-repository';
import { encryptPii } from '@infrastructure/security/pii-encryption';
import { encryptAddressItem, decryptAddressItem } from './pii';
import { clearedOrValue } from '@infrastructure/persistence/changes';
import { isDuplicateKey } from '@infrastructure/persistence/mongo-errors';
import { addressBookMax } from './config';

/**
 * What {@link addressBookRepository.addEntry} resolves to when the book already holds
 * `NODE_ADDRESS_BOOK_MAX` entries — nothing was written.
 */
export const ADDRESS_BOOK_FULL = 'address-book-full';

/**
 * The one-update pipeline that appends an entry and keeps "exactly one default".
 *
 * A pipeline (an aggregation-style update), because the default rule spans the whole array: a
 * claimed default demotes every existing entry, and the first entry of an empty book is the default
 * whatever it asked — neither fits one `$push`, and splitting them leaves a window with two
 * defaults. `$ifNull` is what lets the same update run as the INSERT of a first entry.
 * `$literal` wraps the entry: its fields are user text, and in a pipeline a string starting with `$`
 * is a field path, so an unwrapped label of `$items` would copy the array into the entry.
 * https://www.mongodb.com/docs/manual/tutorial/update-documents-with-aggregation-pipeline/
 *
 * @param item - the entry to append, encrypted, with its own `_id`
 * @param claimsDefault - whether the caller asked for the default slot
 */
const appendEntryPipeline = (item: Record<string, unknown>, claimsDefault: boolean) => {
    const existing = { $ifNull: ['$items', []] };
    const becomesDefault = claimsDefault ? true : { $eq: [{ $size: existing }, 0] };

    return [
        {
            $set: {
                items: {
                    $concatArrays: [
                        {
                            $cond: [
                                becomesDefault,
                                {
                                    $map: {
                                        input: existing,
                                        as: 'entry',
                                        in: { $mergeObjects: ['$$entry', { default: false }] }
                                    }
                                },
                                existing
                            ]
                        },
                        [{ $mergeObjects: [{ $literal: item }, { default: becomesDefault }] }]
                    ]
                },
                // A pipeline upsert has no `$setOnInsert`; `updatedAt` is stamped by Mongoose's own
                // timestamps stage, `createdAt` is kept once set.
                createdAt: { $ifNull: ['$createdAt', '$$NOW'] }
            }
        }
    ];
};

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
 * Every write but the add loads the book, edits it in memory and saves — a READ-MODIFY-WRITE, which
 * the cart avoids, because "exactly one default" is an invariant across the WHOLE array and no single
 * `$set`/`$pull` can demote the old default, promote the new one and prune the removed entry
 * atomically. Nobody edits their book from two devices in the same second the way two tabs race
 * a cart, so mongoose's optimistic versioning on `save()` is protection enough — the loser
 * retries by hand. The ADD is the exception: it is one pipeline update, because the cap on the
 * book's size has to hold under a burst of concurrent adds (see `addEntry`).
 *
 * The type is written out because Mongoose's generics are too large for TS to serialize an
 * inferred one at an export boundary (TS7056) — the same reason `Repository` exists.
 */
export const addressBookRepository: Repository<AddressBookDocument, Wire<AddressBookDocument>> & {
    findByUserId: (userId: string) => Promise<AddressBookDocument | null>;
    addEntry: (
        userId: string,
        entry: AddressInput,
        attemptsLeft?: number
    ) => Promise<AddressBookDocument | typeof ADDRESS_BOOK_FULL>;
    updateEntry: (
        userId: string,
        addressId: string,
        changes: UpdateAddressRequest
    ) => Promise<AddressBookDocument | null>;
    setDefault: (userId: string, addressId: string) => Promise<AddressBookDocument | null>;
    removeEntry: (userId: string, addressId: string) => Promise<AddressBookDocument | null>;
    deleteByUserId: (userId: string, session?: ClientSession) => Promise<void>;
} = {
    ...createRepository<AddressBookDocument, Wire<AddressBookDocument>>(addressBookModel, {
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
                items: (data.items ?? []).map((item) => encryptAddressItem(item))
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
     * Append one entry, creating the book if the user has none, unless it is full.
     *
     * The default invariant is decided here: the first entry is default regardless of what it
     * asked, a later entry claiming `default: true` demotes the current holder, and a later
     * entry that claims nothing changes nothing — all inside ONE update ({@link appendEntryPipeline}).
     *
     * The cap is in that update's FILTER: `items.<max-1>` must not exist. mongod evaluates it while
     * holding the document, so a burst of concurrent adds cannot all read "room" and overshoot, the
     * way a count read beforehand would let them. A filter that misses on an existing book makes
     * the upsert collide with the unique `userId` index; that duplicate key is told apart from a
     * first-insert race by one more read.
     */
    addEntry: (userId: string, entry: AddressInput, attemptsLeft = 3) => {
        const owner = toObjectId(userId);
        const item = { ...encryptAddressItem(entry), _id: new Types.ObjectId() };

        return addressBookModel
            .findOneAndUpdate(
                { userId: owner, [`items.${String(addressBookMax() - 1)}`]: { $exists: false } },
                appendEntryPipeline(item, entry.default ?? false),
                // `updatePipeline`: Mongoose refuses an array update without it.
                // https://mongoosejs.com/docs/api/query.html#Query.prototype.setOptions()
                { upsert: true, returnDocument: 'after', updatePipeline: true }
            )
            .exec()
            .then(decryptBook)
            .catch((error: unknown) => {
                if (!isDuplicateKey(error)) throw error;
                return addressBookModel
                    .findOne({ userId: owner })
                    .exec()
                    .then((book) => {
                        if (book && book.items.length >= addressBookMax()) return ADDRESS_BOOK_FULL;
                        if (attemptsLeft <= 1)
                            throw new Error('addresses: exhausted retries adding an entry', {
                                cause: error
                            });
                        return addressBookRepository.addEntry(userId, entry, attemptsLeft - 1);
                    });
            });
    },

    /**
     * Edit one entry of the caller's own book. Resolves `null` when the book or entry is absent,
     * so the controller answers the same 404 an invented id gets. The default assignment is not
     * an edit of one entry — it is the book's pointer, moved by {@link setDefault}.
     */
    updateEntry: async (userId: string, addressId: string, changes: UpdateAddressRequest) => {
        const book = await addressBookModel.findOne({ userId: toObjectId(userId) }).exec();
        const entry = book?.items.find((item) => String(item._id) === addressId);
        if (!book || !entry) return null;

        // `label`/`phone` are the nullable fields — `null` clears them
        // ($unset on save, via `clearedOrValue`); the other five are required on the resource
        // itself, so the contract refuses `null` for them before this ever runs.
        if (changes.label !== undefined) entry.label = clearedOrValue(changes.label);
        if (changes.fullName !== undefined) entry.fullName = encryptPii(changes.fullName);
        if (changes.street !== undefined) entry.street = encryptPii(changes.street);
        if (changes.city !== undefined) entry.city = encryptPii(changes.city);
        if (changes.zip !== undefined) entry.zip = encryptPii(changes.zip);
        if (changes.country !== undefined) entry.country = encryptPii(changes.country);
        if (changes.phone !== undefined)
            entry.phone = changes.phone === null ? undefined : encryptPii(changes.phone);

        return book.save().then(decryptBook);
    },

    /**
     * Move the book's default pointer to one entry, demoting the holder in the same write.
     * Idempotent: the entry that already holds it is not saved again. Resolves `null` when the
     * book or entry is absent, the same 404 an invented id gets.
     */
    setDefault: async (userId: string, addressId: string) => {
        const book = await addressBookModel.findOne({ userId: toObjectId(userId) }).exec();
        const entry = book?.items.find((item) => String(item._id) === addressId);
        if (!book || !entry) return null;
        if (entry.default) return decryptBook(book);

        for (const item of book.items) item.default = false;
        entry.default = true;

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
    deleteByUserId: (userId: string, session?: ClientSession) =>
        addressBookModel
            .deleteOne({ userId: toObjectId(userId) }, session ? { session } : undefined)
            .exec()
            .then(() => {
                // explicit void return
            })
};
