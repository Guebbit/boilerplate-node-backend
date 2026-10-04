/**
 * @module
 * Who the seed accounts are: their ids, how to log in as them, and how they get their roles.
 * Every other scenario file that needs one of these accounts imports its id from here. Two
 * constraints before editing the credentials: they must stay fixed (the frontend's e2e login
 * types them — keep every `NODE_SEED_*_PASSWORD` identical to the paired frontend's own `.env`
 * copy), and the password stays PLAINTEXT — the schema's pre-save hook hashes it.
 *
 * See: docs/tools/demo-profile.md#the-named-accounts
 */

import { assignRole, bootstrapAccessModel } from '@modules/access';
import { seedPasswordsConfig } from './config';

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

/** The demo owner's login email. */
export const SEED_ADMIN_EMAIL = 'root@root.it';

/**
 * The demo owner's login password — PLAINTEXT; see the file header for why.
 * `NODE_SEED_ADMIN_PASSWORD` overrides it — named for the `admin` role this account actually
 * holds (see {@link seedAccessModel} below), the same name the paired frontend's own `.env`
 * already used. The fallback is a real demo value, not a placeholder, since this repo commits its
 * `.env` in the clear and the demo profile is never a production deployment.
 * `scenario:apply` refuses to run outside development/test, which is what stops it reaching a
 * database anyone but a developer or CI can see.
 */
export const SEED_ADMIN_PASSWORD = seedPasswordsConfig().NODE_SEED_ADMIN_PASSWORD;

/** The demo user's login email. */
export const SEED_USER_EMAIL = 'customer@example.com';

/**
 * The demo user's login password — PLAINTEXT; see the file header for why. `NODE_SEED_USER_PASSWORD`
 * overrides it, same reasoning as {@link SEED_ADMIN_PASSWORD}.
 */
export const SEED_USER_PASSWORD = seedPasswordsConfig().NODE_SEED_USER_PASSWORD;

/** The demo editor's login email. */
export const SEED_EDITOR_EMAIL = 'editor@example.com';

/** The demo editor's login password — PLAINTEXT; same reasoning as {@link SEED_ADMIN_PASSWORD}. */
export const SEED_EDITOR_PASSWORD = seedPasswordsConfig().NODE_SEED_EDITOR_PASSWORD;

/** The demo moderator's login email. */
export const SEED_MODERATOR_EMAIL = 'moderator@example.com';

/** The demo moderator's login password — PLAINTEXT; same reasoning as {@link SEED_ADMIN_PASSWORD}. */
export const SEED_MODERATOR_PASSWORD = seedPasswordsConfig().NODE_SEED_MODERATOR_PASSWORD;

/** Login emails of the persona accounts — see {@link SEED_UNVERIFIED_ID}. */
export const SEED_UNVERIFIED_EMAIL = 'unverified@example.com';

/** Login email of the two-factor persona. */
export const SEED_TWO_FACTOR_EMAIL = 'two-factor@example.com';

/** Login email of the pending-email persona (its pending target is below). */
export const SEED_PENDING_EMAIL_EMAIL = 'pending-email@example.com';

/** Login email of the switched-off persona. */
export const SEED_BANNED_EMAIL = 'banned@example.com';

/** Login email of the second-shopper persona. */
export const SEED_SECOND_SHOPPER_EMAIL = 'second-shopper@example.com';

/** Login emails of the staff accounts — see {@link SEED_MANAGER_ID}. */
export const SEED_MANAGER_EMAIL = 'manager@example.com';

/** Login email of the warehouse staff account. */
export const SEED_WAREHOUSE_EMAIL = 'warehouse@example.com';

/** Login email of the support staff account. */
export const SEED_SUPPORT_EMAIL = 'support@example.com';

/** Login email of the platform-only operator. */
export const SEED_OPERATOR_EMAIL = 'operator@example.com';

/** The address the pending-email persona asked to move to, and has not yet confirmed. */
export const SEED_PENDING_EMAIL_TARGET = 'pending-new-address@example.com';

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

/** The persona and staff accounts' passwords, read once — see {@link seedPasswordsConfig}. */
const personaPasswords = seedPasswordsConfig();

/** The logins for the persona accounts, by the name a spec asks for. */
export const seedPersonaCredentials = {
    unverified: {
        email: SEED_UNVERIFIED_EMAIL,
        password: personaPasswords.NODE_SEED_UNVERIFIED_PASSWORD
    },
    twoFactor: {
        email: SEED_TWO_FACTOR_EMAIL,
        password: personaPasswords.NODE_SEED_TWO_FACTOR_PASSWORD,
        // Published beside the login: a journey that gets in with a backup code must know one.
        backupCodes: SEED_TWO_FACTOR_BACKUP_CODES
    },
    pendingEmail: {
        email: SEED_PENDING_EMAIL_EMAIL,
        password: personaPasswords.NODE_SEED_PENDING_EMAIL_PASSWORD
    },
    banned: { email: SEED_BANNED_EMAIL, password: personaPasswords.NODE_SEED_BANNED_PASSWORD },
    secondShopper: {
        email: SEED_SECOND_SHOPPER_EMAIL,
        password: personaPasswords.NODE_SEED_SECOND_SHOPPER_PASSWORD
    }
} as const;

/** The logins for the staff accounts, by the name a spec asks for. */
export const seedStaffCredentials = {
    manager: { email: SEED_MANAGER_EMAIL, password: personaPasswords.NODE_SEED_MANAGER_PASSWORD },
    warehouse: {
        email: SEED_WAREHOUSE_EMAIL,
        password: personaPasswords.NODE_SEED_WAREHOUSE_PASSWORD
    },
    support: { email: SEED_SUPPORT_EMAIL, password: personaPasswords.NODE_SEED_SUPPORT_PASSWORD },
    operator: {
        email: SEED_OPERATOR_EMAIL,
        password: personaPasswords.NODE_SEED_OPERATOR_PASSWORD
    }
} as const;

/** The logins for the demo accounts. */
export const seedCredentials = {
    admin: { email: SEED_ADMIN_EMAIL, password: SEED_ADMIN_PASSWORD },
    user: { email: SEED_USER_EMAIL, password: SEED_USER_PASSWORD },
    editor: { email: SEED_EDITOR_EMAIL, password: SEED_EDITOR_PASSWORD },
    moderator: { email: SEED_MODERATOR_EMAIL, password: SEED_MODERATOR_PASSWORD },
    ...seedPersonaCredentials,
    ...seedStaffCredentials
} as const;

/**
 * The whole access model, seeded: one shop, the presets, and the seed accounts placed in it.
 * Called by both `seedShop` and `seedBlank` — the two scenarios agree on who these accounts are.
 *
 * `root` is the shop's owner AND the installation's operator — two memberships, because they are
 * two jobs. A request acts as one or the other depending on the key it is asking about, which is
 * exactly the behaviour the platform/tenant split exists to produce, demonstrated by the account
 * everybody logs in as. The two staff accounts each hold exactly one of the newer tenant roles,
 * so each can be logged into and tried on its own — the whole point of adding them to experiment.
 */
export const seedAccessModel = (): Promise<void> =>
    bootstrapAccessModel('The Demo Shop')
        .then((tenant) =>
            Promise.all([
                assignRole(SEED_ADMIN_ID, String(tenant._id), 'tenant', 'admin'),
                assignRole(SEED_ADMIN_ID, null, 'platform', 'operator'),
                assignRole(SEED_USER_ID, String(tenant._id), 'tenant', 'customer'),
                assignRole(SEED_EDITOR_ID, String(tenant._id), 'tenant', 'editor'),
                assignRole(SEED_MODERATOR_ID, String(tenant._id), 'tenant', 'moderator'),
                ...[
                    SEED_UNVERIFIED_ID,
                    SEED_TWO_FACTOR_ID,
                    SEED_PENDING_EMAIL_ID,
                    SEED_BANNED_ID,
                    SEED_SECOND_SHOPPER_ID
                ].map((id) => assignRole(id, String(tenant._id), 'tenant', 'customer')),
                assignRole(SEED_MANAGER_ID, String(tenant._id), 'tenant', 'manager'),
                assignRole(SEED_WAREHOUSE_ID, String(tenant._id), 'tenant', 'warehouse'),
                assignRole(SEED_SUPPORT_ID, String(tenant._id), 'tenant', 'support'),
                // Platform role only: no shop membership, so it holds no shop's keys.
                assignRole(SEED_OPERATOR_ID, null, 'platform', 'operator')
            ])
        )
        .then(() => undefined);
