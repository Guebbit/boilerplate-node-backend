/**
 * @module
 * The user directory's slice of the demo dataset: `root` is the owner every admin-only route
 * needs a caller for, and the `customer` account is the shopper every scoping rule needs someone
 * to be scoped against. Alongside them, one account per newer tenant role — editor, translator,
 * moderator — so each can be logged into and tried on its own rather than only read about. Ids and
 * credentials for all five come from `@kernel/seed-accounts`, since other files in this folder
 * seed rows belonging to these people.
 *
 * Ten further customers (`SEED_CUSTOMER_IDS`) sit alongside them, purely so `./cart` and
 * `./orders` have more than one shopper to vary an order history across. None of them is
 * wired into `@kernel/seed-accounts` — there is no login promise attached to any of the ten, only
 * to the five named accounts above. Cart lines live in `./cart`, not here.
 */

import {
    SEED_OWNER_EMAIL,
    SEED_OWNER_ID,
    SEED_OWNER_PASSWORD,
    SEED_USER_EMAIL,
    SEED_USER_ID,
    SEED_USER_PASSWORD,
    SEED_EDITOR_EMAIL,
    SEED_EDITOR_ID,
    SEED_EDITOR_PASSWORD,
    SEED_TRANSLATOR_EMAIL,
    SEED_TRANSLATOR_ID,
    SEED_TRANSLATOR_PASSWORD,
    SEED_MODERATOR_EMAIL,
    SEED_MODERATOR_ID,
    SEED_MODERATOR_PASSWORD
} from '@kernel/seed-accounts';
import userImages from './users-images.generated.json';
import { makeUser } from '@modules/users/fixtures';
import { userModel } from '@modules/users/model';
import { upsertById, type SeedOutcome, exportCollection } from '@infrastructure/persistence/seed';
import { userRepository } from '@modules/users/repository';

/**
 * Deterministic id for demo customer `index` — never `new Types.ObjectId()`, whose default is
 * time-based and would reseed a different id on every run, breaking `db:seed`'s idempotent
 * upsert. Mirrors `./demo-catalog`'s `fillerProductId`, with its own prefix so the two id spaces
 * can never collide.
 */
const demoCustomerId = (index: number): string => `67f0c2${index.toString(16).padStart(18, '0')}`;

/**
 * The ten further customers, named by who they are rather than by index — `./cart` and
 * `./orders` read these instead of repeating a hex string. Seven (`amelia` through `priya`)
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

/** The five test-critical accounts — one per role a person actually logs in as. */
const namedUsers = [
    makeUser({
        id: SEED_OWNER_ID,
        username: 'root',
        email: SEED_OWNER_EMAIL,
        password: SEED_OWNER_PASSWORD,
        role: 'owner',
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
        username: 'customer',
        email: SEED_USER_EMAIL,
        password: SEED_USER_PASSWORD,
        verified: true,
        // `<paired-frontend>/src/modules/cart/tests/e2e/analytics.cy.ts` logs in as this account
        // and asserts the backend fires `cart_item_added` — `emitAnalyticsEvent`'s consent gate
        // is opt-in, so this is the account that has opted in.
        analyticsConsent: true,
        ...userImages.customer
    }),
    makeUser({
        id: SEED_EDITOR_ID,
        username: 'editor',
        email: SEED_EDITOR_EMAIL,
        password: SEED_EDITOR_PASSWORD,
        role: 'editor',
        verified: true,
        ...userImages.root
    }),
    makeUser({
        id: SEED_TRANSLATOR_ID,
        username: 'translator',
        email: SEED_TRANSLATOR_EMAIL,
        password: SEED_TRANSLATOR_PASSWORD,
        role: 'translator',
        verified: true,
        ...userImages.customer
    }),
    makeUser({
        id: SEED_MODERATOR_ID,
        username: 'moderator',
        email: SEED_MODERATOR_EMAIL,
        password: SEED_MODERATOR_PASSWORD,
        role: 'moderator',
        verified: true,
        ...userImages.root
    })
];

/**
 * The ten further customers — plain shoppers, built from `SEED_CUSTOMER_IDS` in the same order so
 * the two stay in sync by construction. Each takes its password from `makeUser`'s own default
 * rather than stating one: none of these ten is a login anybody is meant to type. Images cycle
 * through the same two-photo pool the `root`/`customer` accounts draw from, alternating by
 * index.
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
 * Each customer's email, keyed the same way as `SEED_CUSTOMER_IDS` — exported so `./cart`
 * and `./orders` can address an order to the right inbox without reconstructing it from the
 * username, which is DERIVED below and not itself part of the public contract.
 */
export const SEED_CUSTOMER_EMAILS = Object.fromEntries(
    CUSTOMER_NAMES.map(([key, username]) => [key, `${username}@example.com`])
) as Record<keyof typeof SEED_CUSTOMER_IDS, string>;

/** The generated customer base — verified accounts, alternating consent and avatar. */
const customerUsers = CUSTOMER_NAMES.map(([key, username], index) =>
    makeUser({
        id: SEED_CUSTOMER_IDS[key],
        username,
        email: SEED_CUSTOMER_EMAILS[key],
        verified: true,
        // Alternating, same as the image cycling below: a real customer base is a mix of
        // opted-in and not, and `root`/`customer` alone left the "granted" path exercised
        // by exactly one account.
        analyticsConsent: index % 2 === 0,
        ...(index % 2 === 0 ? userImages.root : userImages.customer)
    })
);

/** Every demo account: the named ones the e2e suite logs in as, then the customer base. */
export const userFixtures = [...namedUsers, ...customerUsers];

/** Seed this collection. Declared in `./index`; called by `db/demo/index.ts`. */
export const seedUsersCollection = (): Promise<SeedOutcome[]> =>
    Promise.all(userFixtures.map((user) => upsertById(userRepository, user)));

/**
 * Read the seeded accounts back as the API serves them — see `./products`. No password
 * comes out; that's `applyUserTransform`, not an omission — credentials never reach a response,
 * so `scripts/demo/export-dataset.ts` publishes them separately from `@kernel/seed-accounts`.
 */
export const exportSeededUsers = async (): Promise<Record<string, unknown[]>> => ({
    users: await exportCollection(userModel, { _id: 1 })
});
