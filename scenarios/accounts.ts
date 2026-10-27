/**
 * @module
 * Who the seed accounts are: their ids, how to log in as them, and how they get their roles.
 * Logins, states and roles are `shared/scenarios/personas.yaml`; the ids stay here, because other
 * scenario files seed rows that belong to these people and import the id from here. The
 * password stays PLAINTEXT — the schema's pre-save hook hashes it. The paired frontend's e2e reads
 * each login from the scenario description (`seedCredentials`), so it keeps no copy.
 *
 * See: docs/tools/demo-profile.md#the-named-accounts
 */

import { accessService } from '@modules/access';
import { seedPasswords, seedPasswordsConfig } from './config';
import { personas, PERSONA_NAMES } from './personas-schema';
import type { PersonaName } from './personas-schema';
import { seedMembership } from '@modules/access/tests/factories';

/** The demo owner's id — 24-char hex, and a real ObjectId: its leading bytes date it to February 2024. */
export const SEED_ADMIN_ID = '65dd2bdb923652b7800fe180';

/** The demo (non-admin) user's id — same format and vintage as {@link SEED_ADMIN_ID}. */
export const SEED_USER_ID = '65de646a44f861fd83c13f13';

/** The demo editor's id — same format as {@link SEED_ADMIN_ID}. */
export const SEED_EDITOR_ID = '65df1a2b3c4d5e6f7a8b9c01';

/** The demo moderator's id — same format as {@link SEED_ADMIN_ID}. */
export const SEED_MODERATOR_ID = '65df1a2b3c4d5e6f7a8b9c03';

/**
 * The five persona accounts — each is a customer in one particular state the e2e journeys start
 * from. Same id format as {@link SEED_ADMIN_ID}; `scenarios/users.ts` builds the rows.
 */
export const SEED_UNVERIFIED_ID = '65df1a2b3c4d5e6f7a8b9c10';

/** The persona with email two-factor armed. */
export const SEED_TWO_FACTOR_ID = '65df1a2b3c4d5e6f7a8b9c11';

/** The persona who asked to change their email and has not confirmed it yet. */
export const SEED_PENDING_EMAIL_ID = '65df1a2b3c4d5e6f7a8b9c12';

/** The persona an admin switched off (`active: false`): every login is refused. */
export const SEED_BANNED_ID = '65df1a2b3c4d5e6f7a8b9c13';

/** The persona with no special state: a plain customer, the second buyer a two-shoppers journey needs. */
export const SEED_SECOND_SHOPPER_ID = '65df1a2b3c4d5e6f7a8b9c14';

/**
 * The four staff accounts: three shop roles (manager, warehouse, support) and a platform-only
 * operator. Each holds exactly one role, so a journey can log in as it and see what that role sees.
 */
export const SEED_MANAGER_ID = '65df1a2b3c4d5e6f7a8b9c20';

/** The warehouse staff account's id — same format as {@link SEED_MANAGER_ID}. */
export const SEED_WAREHOUSE_ID = '65df1a2b3c4d5e6f7a8b9c21';

/** The support staff account's id — same format as {@link SEED_MANAGER_ID}. */
export const SEED_SUPPORT_ID = '65df1a2b3c4d5e6f7a8b9c22';

/** The platform-only operator's id — same format as {@link SEED_MANAGER_ID}. */
export const SEED_OPERATOR_ID = '65df1a2b3c4d5e6f7a8b9c23';

/**
 * The base32 secret of the authenticator app every armed account is seeded with — PLAINTEXT, like
 * the passwords; the row stores it encrypted. Published beside each armed login (`totpSecret`) so
 * a journey can compute the code a login asks for.
 */
export const SEED_STAFF_TOTP_SECRET = seedPasswordsConfig().NODE_SEED_STAFF_TOTP_SECRET;

/** The address the pending-email persona asked to move to, and has not yet confirmed. */
export const SEED_PENDING_EMAIL_TARGET = personas.accounts.pendingEmail.state.pendingEmail;

/**
 * The two-factor persona's backup codes, in the clear — the row stores only their digests.
 * Fixed, because a journey that signs in with one must know it; each is single-use, so the reset
 * restores them. Shaped like a real one (10 hex characters).
 */
export const SEED_TWO_FACTOR_BACKUP_CODES = [
    'a1b2c3d4e5',
    'f6a7b8c9d0',
    '0a1b2c3d4e',
    '5f6a7b8c9d',
    'e0f1a2b3c4'
] as const;

/** Every account's id, by the name a journey asks for. */
export const SEED_IDS: Readonly<Record<PersonaName, string>> = {
    admin: SEED_ADMIN_ID,
    user: SEED_USER_ID,
    editor: SEED_EDITOR_ID,
    moderator: SEED_MODERATOR_ID,
    unverified: SEED_UNVERIFIED_ID,
    twoFactor: SEED_TWO_FACTOR_ID,
    pendingEmail: SEED_PENDING_EMAIL_ID,
    banned: SEED_BANNED_ID,
    secondShopper: SEED_SECOND_SHOPPER_ID,
    manager: SEED_MANAGER_ID,
    warehouse: SEED_WAREHOUSE_ID,
    support: SEED_SUPPORT_ID,
    operator: SEED_OPERATOR_ID
};

/** What a login publishes: the address, the password, and what the account holds beyond them. */
export interface SeedLogin {
    email: string;
    password: string;
    /** Present when an authenticator app is armed: the secret a journey computes the code from. */
    totpSecret?: string;
    /** Present on the email-2FA persona: single-use codes that get in instead of the mailed one. */
    backupCodes?: readonly string[];
}

/**
 * One account's login. The password is the env override or the committed default; the extras
 * follow from the account's state in `personas.yaml`.
 *
 * @param name - the account
 * @param passwords - every account's password, read once by the caller
 */
const loginOf = (name: PersonaName, passwords: Record<PersonaName, string>): SeedLogin => {
    const { email, state } = personas.accounts[name];
    return {
        email,
        password: passwords[name],
        ...(state.authenticator ? { totpSecret: SEED_STAFF_TOTP_SECRET } : {}),
        ...(state.twoFactor ? { backupCodes: SEED_TWO_FACTOR_BACKUP_CODES } : {})
    };
};

/** The logins for the 13 demo accounts, by the name a spec asks for. */
export const seedCredentials = ((): Record<PersonaName, SeedLogin> => {
    const passwords = seedPasswords();
    return Object.fromEntries(
        PERSONA_NAMES.map((name) => [name, loginOf(name, passwords)])
        // `Object.fromEntries` widens to `Record<string, SeedLogin>`; `PERSONA_NAMES` is every key once.
    ) as Record<PersonaName, SeedLogin>;
})();

/** The demo owner's login password — PLAINTEXT; see the file header for why. */
export const SEED_ADMIN_PASSWORD = seedCredentials.admin.password;

/** The demo user's login password — PLAINTEXT; see the file header for why. */
export const SEED_USER_PASSWORD = seedCredentials.user.password;

/**
 * The whole access model, seeded: one shop, the presets, and the seed accounts placed in it.
 * Called by both `seedShop` and `seedBlank` — the two scenarios agree on who these accounts are.
 *
 * Each account's memberships are `personas.yaml`'s. `admin` is the shop's owner AND the
 * installation's operator — two memberships, because they are two jobs; every other account
 * holds at most one, so each can be logged into and tried on its own. A customer holds none: it
 * is computed from `verifiedAt`, never granted.
 */
export const seedAccessModel = (): Promise<void> =>
    accessService
        .bootstrapAccess('The Demo Shop')
        .then((tenant) =>
            Promise.all(
                PERSONA_NAMES.flatMap((name) =>
                    personas.accounts[name].memberships.map(({ scope, role }) =>
                        seedMembership(
                            SEED_IDS[name],
                            scope === 'tenant' ? String(tenant._id) : null,
                            scope,
                            role
                        )
                    )
                )
            )
        )
        .then(() => undefined);
