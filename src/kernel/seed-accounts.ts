/**
 * @module
 * Who the two demo accounts are: their ids, and how to log in as them.
 *
 * In the kernel rather than in `users` because four modules need a handle on these people and only
 * one owns the record — sharing six string literals here costs less than three registry edges.
 *
 * Two constraints before editing: the credentials must stay fixed (the frontend's e2e login types
 * them, both READMEs quote them), and the password stays PLAINTEXT (the schema's pre-save hook
 * hashes it; a hash written here would drift from that hook).
 *
 * See: docs/tools/demo-profile.md#the-two-seed-accounts
 */

/** The demo admin's id — 24-char hex, and a real ObjectId: its leading bytes date it to February 2024. */
export const SEED_ADMIN_ID = '65dd2bdb923652b7800fe180';

/** The demo (non-admin) user's id — same format and vintage as {@link SEED_ADMIN_ID}. */
export const SEED_USER_ID = '65de646a44f861fd83c13f13';

/** The demo admin's login email. */
export const SEED_ADMIN_EMAIL = 'root@root.it';

/** The demo admin's login password — PLAINTEXT; see the file header for why. */
export const SEED_ADMIN_PASSWORD = 'rootroot';

/** The demo user's login email. */
export const SEED_USER_EMAIL = 'gino@pino.it';

/** The demo user's login password — PLAINTEXT; see the file header for why. */
export const SEED_USER_PASSWORD = 'password';

/** What `demo-data.json` publishes so the frontend can log in as either demo account. */
export const seedCredentials = {
    admin: { email: SEED_ADMIN_EMAIL, password: SEED_ADMIN_PASSWORD },
    user: { email: SEED_USER_EMAIL, password: SEED_USER_PASSWORD }
} as const;
