/**
 * @module
 * The address book's slice of the demo dataset. The admin keeps two entries so "exactly one
 * default" is observable; the ordinary customer keeps one, the common case; every staff persona
 * that can check out keeps one default, so a journey that logs in as it can place an order (every
 * order carries a billing address) without first writing one. The flow runner
 * freezes a copy of the owner's default entry as one order's `shippingAddress` (and its
 * `billingAddress`), which is what makes "an order remembers where it was sent" checkable against a book that can still change.
 */

import { Types } from 'mongoose';
import {
    SEED_ADMIN_ID,
    SEED_EDITOR_ID,
    SEED_MANAGER_ID,
    SEED_MODERATOR_ID,
    SEED_SUPPORT_ID,
    SEED_USER_ID,
    SEED_WAREHOUSE_ID
} from '@scenarios/accounts';
import { SEED_STAFF_ADDRESS_IDS } from '@scenarios/subjects';
import { type SeedOutcome, insertIfAbsentForOwner } from '@scenarios/seed';
import { makeAddressBook } from '@modules/addresses/factories';
import { addressBookRepository } from '@modules/addresses/repository';

/**
 * One staff persona's book: a single default entry at a pinned id.
 *
 * @param userId - the persona's account id
 * @param entryId - the entry's pinned id, one of `SEED_STAFF_ADDRESS_IDS`
 * @param fullName - who the entry names
 * @param place - the street, city and zip the entry carries
 */
const staffBook = (
    userId: string,
    entryId: string,
    fullName: string,
    place: { street: string; city: string; zip: string }
) =>
    makeAddressBook({
        userId,
        items: [{ id: entryId, label: 'home', fullName, country: 'IT', default: true, ...place }]
    });

/**
 * The seeded books: the owner's (two entries), the ordinary customer's (one) and one default
 * entry for each staff persona that can check out.
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
    }),
    staffBook(SEED_MANAGER_ID, SEED_STAFF_ADDRESS_IDS.manager, 'Marta Manager', {
        street: 'Via Emilia 10',
        city: 'Modena',
        zip: '41121'
    }),
    staffBook(SEED_WAREHOUSE_ID, SEED_STAFF_ADDRESS_IDS.warehouse, 'Walter Warehouse', {
        street: 'Via Mazzini 20',
        city: 'Bologna',
        zip: '40121'
    }),
    staffBook(SEED_SUPPORT_ID, SEED_STAFF_ADDRESS_IDS.support, 'Sara Support', {
        street: 'Via Roma 30',
        city: 'Parma',
        zip: '43121'
    }),
    staffBook(SEED_EDITOR_ID, SEED_STAFF_ADDRESS_IDS.editor, 'Elena Editor', {
        street: 'Via Verdi 40',
        city: 'Reggio Emilia',
        zip: '42121'
    }),
    staffBook(SEED_MODERATOR_ID, SEED_STAFF_ADDRESS_IDS.moderator, 'Mario Moderator', {
        street: 'Via Dante 50',
        city: 'Ferrara',
        zip: '44121'
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
