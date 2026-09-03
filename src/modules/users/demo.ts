/**
 * @module
 * The user directory's slice of the demo dataset: `root` is the admin every admin-only route
 * needs a caller for, `ginopinoshow` is the customer every scoping rule needs someone to be
 * scoped against. Ids and credentials for both come from `@kernel/seed-accounts`, since other
 * modules seed rows belonging to these two people.
 *
 * Ten further customers (`SEED_CUSTOMER_IDS`) sit alongside them, purely so `cart/demo.ts` and
 * `orders/demo.ts` have more than one shopper to vary an order history across. None of them is
 * wired into `@kernel/seed-accounts` — there is no login promise attached to any of the ten, only
 * to `root`/`ginopinoshow`. Cart lines live in `src/modules/cart/demo.ts`, not here.
 */

import {
    SEED_ADMIN_EMAIL,
    SEED_ADMIN_ID,
    SEED_ADMIN_PASSWORD,
    SEED_USER_EMAIL,
    SEED_USER_ID,
    SEED_USER_PASSWORD
} from '@kernel/seed-accounts';
import userImages from './demo-images.generated.json';
import { makeUser } from './fixtures';
import { userModel } from './model';
import { upsertById, type SeedOutcome, exportCollection } from '@infrastructure/persistence/seed';
import { userRepository } from './repository';

/**
 * Deterministic id for demo customer `index` — never `new Types.ObjectId()`, whose default is
 * time-based and would reseed a different id on every run, breaking `db:seed`'s idempotent
 * upsert. Mirrors `@modules/products/demo-catalog`'s `fillerProductId`, with its own prefix so
 * the two id spaces can never collide.
 */
const demoCustomerId = (index: number): string => `67f0c2${index.toString(16).padStart(18, '0')}`;

/**
 * The ten further customers, named by who they are rather than by index — `cart/demo.ts` and
 * `orders/demo.ts` read these instead of repeating a hex string. Seven (`amelia` through `priya`)
 * get one small order each and no cart row; three (`marcus`, `harper`, `isla`) get a fuller cart
 * and two orders apiece — see the comments where each is actually used.
 */
export const SEED_CUSTOMER_IDS = {
    amelia: demoCustomerId(0),
    benjamin: demoCustomerId(1),
    chloe: demoCustomerId(2),
    daniel: demoCustomerId(3),
    grace: demoCustomerId(4),
    felix: demoCustomerId(5),
    priya: demoCustomerId(6),
    marcus: demoCustomerId(7),
    harper: demoCustomerId(8),
    isla: demoCustomerId(9)
} as const;

/** The two test-critical accounts — one admin, one ordinary customer. */
const namedUsers = [
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
        ...userImages.root
    }),
    makeUser({
        id: SEED_USER_ID,
        username: 'ginopinoshow',
        email: SEED_USER_EMAIL,
        password: SEED_USER_PASSWORD,
        verified: true,
        // `tests/e2e/specs/../analytics.cy.ts` (frontend) logs in as this account and asserts
        // the backend fires `cart_item_added` — `emitAnalyticsEvent`'s consent gate is opt-in,
        // so this is the account that has opted in.
        analyticsConsent: true,
        ...userImages.ginopinoshow
    })
];

/**
 * The ten further customers — plain shoppers, built from `SEED_CUSTOMER_IDS` in the same order so
 * the two stay in sync by construction. Each takes its password from `makeUser`'s own default
 * rather than stating one: none of these ten is a login anybody is meant to type. Images cycle
 * through the same two-photo pool `root`/`ginopinoshow` draw from, alternating by index.
 */
const CUSTOMER_NAMES: [key: keyof typeof SEED_CUSTOMER_IDS, username: string][] = [
    ['amelia', 'amelia.clarke'],
    ['benjamin', 'benjamin.hughes'],
    ['chloe', 'chloe.whitfield'],
    ['daniel', 'daniel.osei'],
    ['grace', 'grace.sutton'],
    ['felix', 'felix.moreno'],
    ['priya', 'priya.kapoor'],
    ['marcus', 'marcus.bellamy'],
    ['harper', 'harper.quinn'],
    ['isla', 'isla.fenwick']
];

/**
 * Each customer's email, keyed the same way as `SEED_CUSTOMER_IDS` — exported so `cart/demo.ts`
 * and `orders/demo.ts` can address an order to the right inbox without reconstructing it from the
 * username, which is DERIVED below and not itself part of the public contract.
 */
export const SEED_CUSTOMER_EMAILS = Object.fromEntries(
    CUSTOMER_NAMES.map(([key, username]) => [key, `${username}@example.com`])
) as Record<keyof typeof SEED_CUSTOMER_IDS, string>;

const customerUsers = CUSTOMER_NAMES.map(([key, username], index) =>
    makeUser({
        id: SEED_CUSTOMER_IDS[key],
        username,
        email: SEED_CUSTOMER_EMAILS[key],
        verified: true,
        // Alternating, same as the image cycling below: a real customer base is a mix of
        // opted-in and not, and `root`/`ginopinoshow` alone left the "granted" path exercised
        // by exactly one account.
        analyticsConsent: index % 2 === 0,
        ...(index % 2 === 0 ? userImages.root : userImages.ginopinoshow)
    })
);

export const userFixtures = [...namedUsers, ...customerUsers];

/** Seed this module's collection. Declared in `module.ts`; called by `db/demo/index.ts`. */
export const seedUsersCollection = (): Promise<SeedOutcome[]> =>
    Promise.all(userFixtures.map((user) => upsertById(userRepository, user)));

/**
 * Read the seeded accounts back as the API serves them — see `../products/demo`. No password
 * comes out; that's `applyUserTransform`, not an omission — credentials never reach a response,
 * so `scripts/export-demo-dataset.ts` publishes them separately from `@kernel/seed-accounts`.
 */
export const exportSeededUsers = async (): Promise<Record<string, unknown[]>> => ({
    users: await exportCollection(userModel, { _id: 1 })
});
