/**
 * @module
 * The address book's slice of the demo dataset. The admin keeps two entries so "exactly one
 * default" is observable; the ordinary customer keeps one, the common case. The flow runner
 * freezes a copy of the owner's default entry as one order's `shippingAddress`, which is what
 * makes "an order remembers where it was sent" checkable against a book that can still change.
 */

import { Types } from 'mongoose';
import { SEED_ADMIN_ID, SEED_USER_ID } from '@scenarios/accounts';
import { type SeedOutcome, insertIfAbsentForOwner } from '@scenarios/seed';
import { makeAddressBook } from '@modules/addresses/factories';
import { addressBookRepository } from '@modules/addresses/repository';

/**
 * The two seeded books: the owner's (two entries) and the ordinary customer's (one).
 *
 * No pinned `_id` on the BOOK — `insertIfAbsentForOwner` keys on `userId`, so an id buys no
 * idempotency. Each ENTRY needs one too — the contract requires it — but nothing looks one up by
 * value, so each is minted fresh rather than hand-picked.
 */
export const addressBookFixtures = [
    makeAddressBook({
        userId: SEED_ADMIN_ID,
        items: [
            /*
             * A shipped order restates (never references) a copy of this entry as its
             * `shippingAddress`: an order's address is a snapshot that must be free to differ from
             * the live book — sharing the literal would make them unable to disagree, which is what
             * this fixture demonstrates.
             */
            {
                id: new Types.ObjectId().toHexString(),
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
                id: new Types.ObjectId().toHexString(),
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
        userId: SEED_USER_ID,
        items: [
            {
                id: new Types.ObjectId().toHexString(),
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
 * Seed this collection. Declared in `./index`'s `shopModules`; walked by `seedShop`.
 *
 * Keyed on the owner even though these fixtures do pin an `_id`: `userId` is the unique column and
 * the one every query here reaches a book through.
 */
export const seedAddressBooksCollection = (): Promise<SeedOutcome[]> =>
    Promise.all(
        addressBookFixtures.map((book) => insertIfAbsentForOwner(addressBookRepository, book))
    );
