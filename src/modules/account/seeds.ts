/**
 * The address book's slice of the demo dataset.
 *
 * This module owned a collection for a while before it owned any demo data — the address book was
 * a late addition, and the seeder walks manifests rather than a list, so a module that declares no
 * `seeds` is skipped in silence. The visible cost was a storefront where the checkout's address
 * step had nothing to select, and `/account/addresses` answered `{ addresses: [] }` on a dataset
 * that is otherwise a complete shop.
 *
 * ## What these two books are FOR
 *
 * The admin keeps two entries because "exactly one default" is only observable with more than one:
 * one book here proves the invariant holds, and the second entry is what a "make this the default"
 * demo has to click on. The ordinary customer keeps one, so the frequent case — a person with a
 * single saved address, which checkout picks without asking — is also in the dataset.
 *
 * Nobody keeps zero. That state needs no fixture: absence and an empty book are the same thing
 * here (`addressesGet` answers an empty view for both), and every fresh signup is already in it.
 *
 * One seeded order freezes a matching copy of the admin's default entry as its `shippingAddress`,
 * which is what makes "an order remembers where it was sent" checkable against a book that can
 * still change. See the note on that entry for why it is restated there rather than shared.
 */

import { SEED_ADMIN_ID, SEED_USER_ID } from '@kernel/seed-accounts';
import { SEED_SAVE_OPTIONS, type SeedOutcome } from '@infrastructure/persistence/seed';
import { makeAddressBook } from './factory';
import { addressBookModel } from './model';
import { addressBookRepository } from './repository';

export const addressBookFixtures = [
    makeAddressBook({
        id: '65dd2ce31f5b3a9e04c7b210',
        userId: SEED_ADMIN_ID,
        items: [
            /*
             * `orders/seeds.ts` freezes a matching copy of this entry as one order's
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
 * Upsert one book by its OWNER rather than by id — see `../cart/seeds`.
 *
 * `userId` is the unique column and the one every query here uses, so the skip-if-present policy
 * is stated against it even though these fixtures do pin an `_id`.
 */
const upsertByOwner = async (
    fixture: (typeof addressBookFixtures)[number]
): Promise<SeedOutcome> => {
    const existing = await addressBookRepository.findByUserId(fixture.userId.toString());
    if (existing) return 'skipped';
    await addressBookRepository.create(fixture, SEED_SAVE_OPTIONS);
    return 'created';
};

/** Seed this module's collection. Declared in `module.ts`; called by `db/seeds/index.ts`. */
export const seedAddressBooksCollection = (): Promise<SeedOutcome[]> =>
    Promise.all(addressBookFixtures.map((book) => upsertByOwner(book)));

/**
 * Read the seeded books back as stored, sorted by owner — see `../cart/seeds`.
 *
 * No endpoint serves a raw book: `GET /account/addresses` answers `{ addresses: [...] }`, which
 * `./services/addresses` builds from `items`. What is published here is therefore the stored row,
 * whose entries serialize as the contract's `Address` because `addressItemSchema` carries the
 * shared serializer — so the frontend's mock can answer the endpoint by reading `items` straight
 * out of this file.
 */
export const exportSeededAddressBooks = async (): Promise<Record<string, unknown[]>> => ({
    addressBooks: await addressBookModel
        .find()
        .sort({ userId: 1 })
        .exec()
        .then((documents) => documents.map((document_) => document_.toJSON()))
});
