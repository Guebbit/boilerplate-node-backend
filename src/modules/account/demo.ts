/**
 * @module
 * The address book's slice of the demo dataset.
 *
 * The admin keeps two entries because "exactly one default" is only observable with more than
 * one; the ordinary customer keeps one, for the common single-address case. Nobody keeps zero —
 * an empty book and no book read the same here, and every signup already has one.
 *
 * `orders/demo.ts` freezes a copy of the admin's default entry as one order's `shippingAddress`,
 * which is what makes "an order remembers where it was sent" checkable against a book that can
 * still change.
 */

import { SEED_ADMIN_ID, SEED_USER_ID } from '@kernel/seed-accounts';
import {
    type SeedOutcome,
    exportCollection,
    upsertByOwner
} from '@infrastructure/persistence/seed';
import { makeAddressBook } from './fixtures';
import { addressBookModel } from './model';
import { addressBookRepository } from './repository';

/** The two seeded books: the admin's (two entries) and the ordinary customer's (one). */
export const addressBookFixtures = [
    makeAddressBook({
        id: '65dd2ce31f5b3a9e04c7b210',
        userId: SEED_ADMIN_ID,
        items: [
            /*
             * `orders/demo.ts` freezes a matching copy of this entry as one order's
             * `shippingAddress`. It RESTATES it rather than importing it, and that is the correct
             * shape: `orders` declares no edge on this module, an order's address is a snapshot
             * that must be free to differ from the live book, and sharing the literal would make
             * the two unable to disagree — which is the property the fixture exists to show.
             */
            {
                id: '65dd2ce31f5b3a9e04c7b211',
                label: 'home',
                fullName: 'Root Rootsson',
                street: 'Via del Boilerplate 1',
                city: 'Modena',
                zip: '41121',
                country: 'IT',
                phone: '+39 059 000001',
                default: true
            },
            /* The second entry, and the one a "set as default" demo moves the flag onto. */
            {
                id: '65dd2d1a2c6f4b8d15e9c322',
                label: 'office',
                fullName: 'Root Rootsson',
                street: 'Viale Guebbit 42',
                city: 'Bologna',
                zip: '40121',
                country: 'IT',
                default: false
            }
        ]
    }),
    /*
     * The ordinary customer, with the phone number omitted rather than blank: `phone` is optional
     * in the contract, and a dataset where every optional field happens to be filled never shows a
     * client what an absent one looks like.
     */
    makeAddressBook({
        id: '65de650b3d7e2c1a48f0b104',
        userId: SEED_USER_ID,
        items: [
            {
                id: '65de650b3d7e2c1a48f0b105',
                label: 'casa',
                fullName: 'Gino Pino',
                street: 'Via Pino 7',
                city: 'Napoli',
                zip: '80121',
                country: 'IT',
                default: true
            }
        ]
    })
];

/**
 * Seed this module's collection. Declared in `module.ts`; called by `db/demo/index.ts`.
 *
 * Keyed on the owner even though these fixtures do pin an `_id`: `userId` is the unique column and
 * the one every query here reaches a book through.
 */
export const seedAddressBooksCollection = (): Promise<SeedOutcome[]> =>
    Promise.all(addressBookFixtures.map((book) => upsertByOwner(addressBookRepository, book)));

/**
 * Read the seeded books back as stored, sorted by owner — see `../cart/demo`.
 *
 * No endpoint serves a raw book: `GET /account/addresses` answers `{ addresses: [...] }`, which
 * `./services/addresses` builds from `items`. What is published here is therefore the stored row,
 * whose entries serialize as the contract's `Address` because `addressItemSchema` carries the
 * shared serializer — so the frontend's mock can answer the endpoint by reading `items` straight
 * out of this file.
 */
export const exportSeededAddressBooks = async (): Promise<Record<string, unknown[]>> => ({
    addressBooks: await exportCollection(addressBookModel, { userId: 1 })
});
