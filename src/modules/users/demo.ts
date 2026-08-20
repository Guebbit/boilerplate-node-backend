/**
 * The user directory's slice of the demo dataset.
 *
 * Two accounts, one of each kind, because two levels of access is the whole model: `root` is the
 * admin every admin-only route needs a caller for, and `ginopinoshow` is the ordinary customer
 * every scoping rule needs someone to be scoped against.
 *
 * The ids and credentials come from `@kernel/seed-accounts` rather than being written here: three
 * other modules seed rows that belong to these two people, and none of them has a registry edge on
 * this one. See that file for why the kernel is where six shared literals cost the least.
 *
 * The cart lines are NOT here. They used to be — the old shared fixture file hung a `cart` array
 * off each user and the cart module read it back out, which put one module's records inside
 * another's. `src/modules/cart/demo.ts` owns them now.
 */

import {
    SEED_ADMIN_EMAIL,
    SEED_ADMIN_ID,
    SEED_ADMIN_PASSWORD,
    SEED_USER_EMAIL,
    SEED_USER_ID,
    SEED_USER_PASSWORD
} from '@kernel/seed-accounts';
import { makeUser } from './factory';
import { userModel } from './model';
import { upsertById, type SeedOutcome, exportCollection } from '@infrastructure/persistence/seed';
import { userRepository } from './repository';

export const userFixtures = [
    makeUser({
        id: SEED_ADMIN_ID,
        username: 'root',
        email: SEED_ADMIN_EMAIL,
        password: SEED_ADMIN_PASSWORD,
        admin: true,
        /*
         * Overrides the schema's `verified: false`, which is right for self-signup — nobody has
         * vouched for the address yet — and wrong here. A seed account exists to be logged into,
         * not to demonstrate the "verify your email" nag banner to everyone who boots the demo.
         */
        verified: true,
        imageUrl: '/images/seed/9726c4217f5998511f372afab4800ac8.jpg'
    }),
    makeUser({
        id: SEED_USER_ID,
        username: 'ginopinoshow',
        email: SEED_USER_EMAIL,
        password: SEED_USER_PASSWORD,
        verified: true,
        imageUrl: '/images/seed/96346b77daf138a279677cb75c400ee9.jpg'
    })
];

/** Seed this module's collection. Declared in `module.ts`; called by `db/demo/index.ts`. */
export const seedUsersCollection = (): Promise<SeedOutcome[]> =>
    Promise.all(userFixtures.map((user) => upsertById(userRepository, user)));

/**
 * Read the seeded accounts back as the API serves them — see `../products/demo`.
 *
 * No password comes out, and that is `applyUserTransform` doing its job rather than an omission
 * here: credentials never reach a response, so `scripts/export-seed.ts` publishes them separately
 * from `@kernel/seed-accounts`.
 */
export const exportSeededUsers = async (): Promise<Record<string, unknown[]>> => ({
    users: await exportCollection(userModel, { _id: 1 })
});
