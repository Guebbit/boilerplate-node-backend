/**
 * @module
 * The user directory's slice of the demo dataset: `root` is the owner every admin-only route
 * needs a caller for, and the `customer` account is the shopper every scoping rule needs someone
 * to be scoped against. Alongside them, one account per newer tenant role — editor, moderator —
 * so each can be logged into and tried on its own rather than only read about. Ids and
 * credentials for all four come from `@scenarios/accounts`, since other files in this folder
 * seed rows belonging to these people.
 *
 * Ten further customers (`SEED_CUSTOMER_IDS`) sit alongside them, purely so the flow runner has
 * more than one shopper to vary an order history across. None is wired into `@scenarios/accounts`
 * — there is no login promise attached to any of the ten, only to the four named accounts above.
 * They log in with `makeUser`'s own default password, which is how
 * `scenarios/flows/shop-history.ts` shops as them.
 */

import {
    SEED_ADMIN_EMAIL,
    SEED_ADMIN_ID,
    SEED_ADMIN_PASSWORD,
    SEED_USER_EMAIL,
    SEED_USER_ID,
    SEED_USER_PASSWORD,
    SEED_EDITOR_EMAIL,
    SEED_EDITOR_ID,
    SEED_EDITOR_PASSWORD,
    SEED_MODERATOR_EMAIL,
    SEED_MODERATOR_ID,
    SEED_MODERATOR_PASSWORD,
    seedPersonaCredentials,
    SEED_UNVERIFIED_ID,
    SEED_TWO_FACTOR_ID,
    SEED_TWO_FACTOR_BACKUP_CODES,
    SEED_PENDING_EMAIL_ID,
    SEED_PENDING_EMAIL_TARGET,
    SEED_BANNED_ID,
    seedStaffCredentials,
    SEED_MANAGER_ID,
    SEED_WAREHOUSE_ID,
    SEED_SUPPORT_ID,
    SEED_OPERATOR_ID
} from '@scenarios/accounts';
import { generateBackupCodeSalt, hashBackupCodes } from '@modules/account/two-factor/backup-codes';
import userImages from './users-images.generated.json';
import { makeUser } from '@modules/users/factories';
import { insertIfAbsent, type SeedOutcome } from '@scenarios/seed';
import { userRepository } from '@modules/users/repository';
import { assignRole } from '@modules/access';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';

/**
 * Deterministic id for seed customer `index` — never `new Types.ObjectId()`, whose default is
 * time-based and would reseed a different id on every run, breaking `scenario:apply`'s idempotent
 * upsert. Mirrors `./products-filler`'s `fillerProductId`, with its own prefix so the two id spaces
 * can never collide.
 */
const seedCustomerId = (index: number): string => `67f0c2${index.toString(16).padStart(18, '0')}`;

/**
 * The ten further customers, named by who they are rather than by index —
 * `scenarios/flows/shop-history.ts` reads these instead of repeating a hex string. Seven
 * (`amelia` through `priya`) get one small order each and no cart row; three (`marcus`, `harper`,
 * `isla`) get a fuller cart and two orders apiece — see the comments where each is actually used.
 */
export const SEED_CUSTOMER_IDS = {
    amelia: seedCustomerId(0),
    benjamin: seedCustomerId(1),
    chloe: seedCustomerId(2),
    daniel: seedCustomerId(3),
    grace: seedCustomerId(4),
    felix: seedCustomerId(5),
    priya: seedCustomerId(6),
    marcus: seedCustomerId(7),
    harper: seedCustomerId(8),
    isla: seedCustomerId(9)
} as const;

/**
 * The two-factor persona's backup-code salt, minted once per process: the digests are stored under
 * it, and the codes themselves are fixed ({@link SEED_TWO_FACTOR_BACKUP_CODES}), so any salt works
 * as long as the two stay together.
 */
const twoFactorBackupCodeSalt = generateBackupCodeSalt();

/**
 * The four personas — customers in one particular state each, written straight to the collection
 * because reaching the state through the API needs a mail or a code the seeder does not read.
 * Ids, addresses and passwords come from `@scenarios/accounts`.
 */
const personaUsers = [
    // Signed up, never proved the address: no `verifiedAt`, so the verify-your-email nag shows.
    makeUser({
        id: SEED_UNVERIFIED_ID,
        username: 'unverified',
        ...seedPersonaCredentials.unverified,
        ...userImages.customer
    }),
    // Email 2FA armed. A login mails a code (read it from the outbox or Mailpit), or a backup code
    // from `SEED_TWO_FACTOR_BACKUP_CODES` gets in instead.
    makeUser({
        id: SEED_TWO_FACTOR_ID,
        username: 'two-factor',
        email: seedPersonaCredentials.twoFactor.email,
        password: seedPersonaCredentials.twoFactor.password,
        verifiedAt: new Date(),
        twoFactorEnabledAt: new Date().toISOString(),
        twoFactorMethods: [{ method: 'email', enrolledAt: new Date() }],
        twoFactorBackupCodes: hashBackupCodes(
            SEED_TWO_FACTOR_BACKUP_CODES,
            twoFactorBackupCodeSalt
        ),
        twoFactorBackupCodeSalt,
        ...userImages.customer
    }),
    // An address change asked for and not confirmed: `pendingEmail` set, the live email unchanged.
    makeUser({
        id: SEED_PENDING_EMAIL_ID,
        username: 'pending-email',
        ...seedPersonaCredentials.pendingEmail,
        verifiedAt: new Date(),
        pendingEmail: SEED_PENDING_EMAIL_TARGET,
        ...userImages.customer
    }),
    // Switched off by an admin: `active: false`, so a login is refused.
    makeUser({
        id: SEED_BANNED_ID,
        username: 'banned',
        ...seedPersonaCredentials.banned,
        verifiedAt: new Date(),
        active: false,
        ...userImages.customer
    })
];

/**
 * The four staff accounts — three shop roles and a platform-only operator. Verified, because each
 * exists to be logged into; the role itself is a membership, assigned by `seedAccessModel`.
 */
const staffUsers = (
    [
        { name: 'manager', id: SEED_MANAGER_ID },
        { name: 'warehouse', id: SEED_WAREHOUSE_ID },
        { name: 'support', id: SEED_SUPPORT_ID },
        { name: 'operator', id: SEED_OPERATOR_ID }
    ] as const
).map(({ name, id }) =>
    makeUser({
        id,
        username: name,
        ...seedStaffCredentials[name],
        verifiedAt: new Date(),
        ...userImages.root
    })
);

/**
 * The test-critical accounts — one per role a person actually logs in as. Exported so the
 * `blank` scenario ({@link seedNamedUsersCollection}) can seed exactly these and none of the
 * filler customer base below — `blank` has no shop for a customer to shop in.
 */
export const namedUsers = [
    makeUser({
        id: SEED_ADMIN_ID,
        username: 'root',
        email: SEED_ADMIN_EMAIL,
        password: SEED_ADMIN_PASSWORD,
        /*
         * Verified, not the schema's absent-until-proven default — a seed account exists to be
         * logged into, not to demonstrate the "verify your email" nag banner to everyone who boots
         * the demo. The role itself is a membership, assigned by `@scenarios/accounts`'s
         * `seedAccessModel` — this file only builds the document.
         */
        verifiedAt: new Date(),
        ...userImages.root
    }),
    makeUser({
        id: SEED_USER_ID,
        username: 'customer',
        email: SEED_USER_EMAIL,
        password: SEED_USER_PASSWORD,
        verifiedAt: new Date(),
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
        verifiedAt: new Date(),
        ...userImages.root
    }),
    makeUser({
        id: SEED_MODERATOR_ID,
        username: 'moderator',
        email: SEED_MODERATOR_EMAIL,
        password: SEED_MODERATOR_PASSWORD,
        verifiedAt: new Date(),
        ...userImages.root
    }),
    ...personaUsers,
    ...staffUsers
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
 * Each customer's email, keyed the same way as `SEED_CUSTOMER_IDS` — exported so the flow runner
 * can sign each of them in without reconstructing an address from the username, which is DERIVED
 * below and not itself part of the public contract.
 */
export const SEED_CUSTOMER_EMAILS = Object.fromEntries(
    CUSTOMER_NAMES.map(([key, username]) => [key, `${username}@example.com`])
    // `Object.fromEntries` widens to `Record<string, string>` — it has no way to know
    // `CUSTOMER_NAMES` covers every key of `SEED_CUSTOMER_IDS` exactly once, which it does.
) as Record<keyof typeof SEED_CUSTOMER_IDS, string>;

/**
 * The generated customer base — verified, ACTIVE accounts, alternating consent and avatar.
 *
 * None is seeded banned, however much the demo needs a banned one: `marcus` shops first and is
 * then banned by the owner through `PATCH /users/{id}`, so the audit trail records the ban actually
 * happening instead of a row asserting that it did.
 */
const customerUsers = CUSTOMER_NAMES.map(([key, username], index) =>
    makeUser({
        id: SEED_CUSTOMER_IDS[key],
        username,
        email: SEED_CUSTOMER_EMAILS[key],
        verifiedAt: new Date(),
        // Alternating, same as the image cycling below: a real customer base is a mix of
        // opted-in and not, and `root`/`customer` alone left the "granted" path exercised
        // by exactly one account.
        analyticsConsent: index % 2 === 0,
        ...(index % 2 === 0 ? userImages.root : userImages.customer)
    })
);

/** Every demo account: the named ones the e2e suite logs in as, then the customer base. */
export const userFixtures = [...namedUsers, ...customerUsers];

/**
 * Seed this collection, plus the ten filler customers' `customer` membership — the four named
 * accounts get theirs from `@scenarios/accounts`'s `seedAccessModel`, which `./index`'s `seedShop`
 * always runs first, but these ten are this file's own and nobody else assigns them a role. The
 * document write and the membership grant both go through `insertIfAbsent`/`assignRole`'s own
 * upserts, so re-running this against an already-seeded database changes nothing.
 * Declared in `./index`'s `shopModules`; walked by `seedShop`.
 */
export const seedUsersCollection = (): Promise<SeedOutcome[]> =>
    Promise.all(userFixtures.map((user) => insertIfAbsent(userRepository, user))).then((outcomes) =>
        Promise.all(
            customerUsers.map((user) =>
                assignRole(String(user._id), DEPLOYMENT_TENANT_ID, 'tenant', 'customer')
            )
        ).then(() => outcomes)
    );

/**
 * Seed only the four named accounts — `blank`'s contribution to `users`. Called by
 * `scenarios/blank.ts`'s `seedBlank`, never by `scenarios/apply.ts`.
 */
export const seedNamedUsersCollection = (): Promise<SeedOutcome[]> =>
    Promise.all(namedUsers.map((user) => insertIfAbsent(userRepository, user)));
