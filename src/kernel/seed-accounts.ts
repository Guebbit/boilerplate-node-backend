/**
 * @module
 * Who the two demo accounts are: their ids, and how to log in as them. Lives in the kernel, not
 * `users`, since four modules need a handle on these people and only one owns the record. Two
 * constraints before editing: credentials must stay fixed (the frontend's e2e login types them —
 * keep `NODE_SEED_ADMIN_PASSWORD`/`NODE_SEED_USER_PASSWORD` identical to the paired frontend's
 * own `.env` copy), and the password stays PLAINTEXT — the schema's pre-save hook hashes it.
 *
 * See: docs/tools/demo-profile.md#the-two-seed-accounts
 */

/** The demo admin's id — 24-char hex, and a real ObjectId: its leading bytes date it to February 2024. */
export const SEED_ADMIN_ID = '65dd2bdb923652b7800fe180';

/** The demo (non-admin) user's id — same format and vintage as {@link SEED_ADMIN_ID}. */
export const SEED_USER_ID = '65de646a44f861fd83c13f13';

/** The demo admin's login email. */
export const SEED_ADMIN_EMAIL = 'root@root.it';

/**
 * The demo admin's login password — PLAINTEXT; see the file header for why. `NODE_SEED_ADMIN_PASSWORD`
 * overrides it; the fallback is a real demo value, not a placeholder, since this repo commits its
 * `.env` in the clear and the demo profile is never a production deployment.
 */
export const SEED_ADMIN_PASSWORD = process.env.NODE_SEED_ADMIN_PASSWORD ?? 'Demo-Admin1!';

/** The demo user's login email. */
export const SEED_USER_EMAIL = 'gino@pino.it';

/**
 * The demo user's login password — PLAINTEXT; see the file header for why. `NODE_SEED_USER_PASSWORD`
 * overrides it, same reasoning as {@link SEED_ADMIN_PASSWORD}.
 */
export const SEED_USER_PASSWORD = process.env.NODE_SEED_USER_PASSWORD ?? 'Demo-User1!';

/** What `demo-data.json` publishes so the frontend can log in as either demo account. */
export const seedCredentials = {
    admin: { email: SEED_ADMIN_EMAIL, password: SEED_ADMIN_PASSWORD },
    user: { email: SEED_USER_EMAIL, password: SEED_USER_PASSWORD }
} as const;
