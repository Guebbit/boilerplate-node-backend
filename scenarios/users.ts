/**
 * @module
 * The user directory's slice of the demo dataset: `root` is the owner every admin-only route
 * needs a caller for, and the `customer` account is the shopper every scoping rule needs someone
 * to be scoped against. Alongside them, one account per newer tenant role, the personas and the
 * staff, so each can be logged into and tried on its own rather than only read about. All 13 are
 * `shared/scenarios/personas.yaml`; ids and credentials come from `@scenarios/accounts`, since
 * other files in this folder seed rows belonging to these people.
 *
 * Ten further customers (`SEED_CUSTOMER_IDS`) sit alongside them, purely so the flow runner has
 * more than one shopper to vary an order history across. None is wired into `@scenarios/accounts`
 * — there is no login promise attached to any of the ten, only to the 13 named accounts above.
 * They log in with `makeUser`'s own default password, which is how
 * `scenarios/flows/shop-history.ts` shops as them.
 */

import {
    SEED_IDS,
    seedCredentials,
    SEED_TWO_FACTOR_BACKUP_CODES,
    SEED_STAFF_TOTP_SECRET
} from '@scenarios/accounts';
import { personas, PERSONA_NAMES } from '@scenarios/personas-schema';
import type { PersonaName } from '@scenarios/personas-schema';
import { Types } from 'mongoose';
import { generateBackupCodeSalt, hashBackupCodes } from '@modules/account/two-factor/backup-codes';
import { encryptTotpSecret } from '@modules/account/two-factor/totp';
import type { UserOverrides } from '@modules/users/factories';
import userImages from './users-images.generated.json';
import { makeUser } from '@modules/users/factories';
import { insertIfAbsent, type SeedOutcome } from '@scenarios/seed';
import { userRepository } from '@modules/users/repository';

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
 * An authenticator app already armed with the shared staff secret — what a staff role needs
 * before it grants anything. The entry's id is the account's own, so the encrypted secret (bound
 * to that id) is reproducible per account and a reseed writes the same row.
 *
 * @param userId - the account's id, which doubles as its one method entry's id
 */
const armedAuthenticator = (
    userId: string
): Pick<UserOverrides, 'twoFactorEnabledAt' | 'authenticatorEnabledAt' | 'twoFactorMethods'> => {
    const enrolledAt = new Date();
    return {
        twoFactorEnabledAt: enrolledAt.toISOString(),
        authenticatorEnabledAt: enrolledAt,
        twoFactorMethods: [
            {
                _id: new Types.ObjectId(userId),
                method: 'totp',
                enrolledAt,
                secret: encryptTotpSecret(SEED_STAFF_TOTP_SECRET, userId)
            }
        ]
    };
};

/**
 * One demo account as a user row, built from its entry in `shared/scenarios/personas.yaml`. The
 * state flags map onto the row: an unverified account has no `verifiedAt`, an armed authenticator
 * gets the shared staff secret, email 2FA gets the fixed backup codes. Written straight to the
 * collection, because reaching a state through the API needs a mail or a code the seeder does not
 * read. Ids and passwords come from `@scenarios/accounts`.
 *
 * @param name - the account
 */
const userOf = (name: PersonaName) => {
    const { username, state } = personas.accounts[name];
    const id = SEED_IDS[name];
    const { email, password } = seedCredentials[name];

    return makeUser({
        id,
        username,
        email,
        password,
        // A seed account exists to be logged into, not to demonstrate the verify-your-email nag.
        ...(state.verified ? { verifiedAt: new Date() } : {}),
        ...(state.active ? {} : { active: false }),
        ...(state.pendingEmail === null ? {} : { pendingEmail: state.pendingEmail }),
        // The consent gate is opt-in and needs its date: with no `analyticsConsentAt` the account
        // counts as never asked, and the gate reads the header.
        ...(state.analyticsConsent
            ? { analyticsConsent: true, analyticsConsentAt: new Date() }
            : {}),
        ...(state.authenticator ? armedAuthenticator(id) : {}),
        ...(state.twoFactor ? emailTwoFactor() : {}),
        // Armed accounts are the people who run the shop; they wear the owner's photo.
        ...(state.authenticator ? userImages.root : userImages.customer)
    });
};

/**
 * Email 2FA armed: a login mails a code (read it from the outbox or Mailpit), or one of the
 * fixed backup codes gets in instead.
 */
const emailTwoFactor = (): Pick<
    UserOverrides,
    'twoFactorEnabledAt' | 'twoFactorMethods' | 'twoFactorBackupCodes' | 'twoFactorBackupCodeSalt'
> => ({
    twoFactorEnabledAt: new Date().toISOString(),
    twoFactorMethods: [{ method: 'email', enrolledAt: new Date() }],
    twoFactorBackupCodes: hashBackupCodes(SEED_TWO_FACTOR_BACKUP_CODES, twoFactorBackupCodeSalt),
    twoFactorBackupCodeSalt
});

/**
 * The test-critical accounts — all 13 of `personas.yaml`, in its order. Used by the `blank`
 * scenario ({@link seedNamedUsersCollection}) to seed exactly these and none of the filler
 * customer base below — `blank` has no shop for a customer to shop in.
 */
const namedUsers = PERSONA_NAMES.map((name) => userOf(name));

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
 * The generated customer base — verified, ACTIVE accounts, alternating consent and avatar (the
 * avatar is what `demo:remove` takes out, with the seed images).
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
        // Alternating: a real customer base is a mix of opted-in and not, and `root`/`customer`
        // alone left the "granted" path exercised by exactly one account.
        analyticsConsent: index % 2 === 0,
        analyticsConsentAt: new Date(),
        ...(index % 2 === 0 ? userImages.root : userImages.customer)
    })
);

/** Every demo account: the named ones the e2e suite logs in as, then the customer base. */
const userFixtures = [...namedUsers, ...customerUsers];

/**
 * Seed this collection. The filler customers hold no role at all — a customer is computed from
 * `verifiedAt`, never granted — so only the documents are written, through `insertIfAbsent`'s
 * own upsert: re-running this against an already-seeded database changes nothing.
 * Collected into `shopModules` (`./shop-modules`); run by `seedShop`.
 */
const seedUsersCollection = (): Promise<SeedOutcome[]> =>
    Promise.all(userFixtures.map((user) => insertIfAbsent(userRepository, user)));

/**
 * Seed only the 13 named accounts — `blank`'s contribution to `users`. Called by
 * `scenarios/blank.ts`'s `seedBlank`, never by `scenarios/apply.ts`.
 */
export const seedNamedUsersCollection = (): Promise<SeedOutcome[]> =>
    Promise.all(namedUsers.map((user) => insertIfAbsent(userRepository, user)));

/**
 * This module's entry in the `shop` fixture table. Picked up by `npm run regenerate`
 * (`scenarios/shop-modules.generated.ts`), so deleting this file deletes the entry.
 */
export const shopModule = { seed: seedUsersCollection };
