/**
 * @module
 * Who the demo accounts are: their ids, and how to log in as them. Lives in the kernel, not
 * `users`, since several modules need a handle on these people and only one owns the record. Two
 * constraints before editing: credentials must stay fixed (the frontend's e2e login types them —
 * keep every `NODE_SEED_*_PASSWORD` identical to the paired frontend's own `.env` copy), and the
 * password stays PLAINTEXT — the schema's pre-save hook hashes it.
 *
 * See: docs/tools/demo-profile.md#the-two-seed-accounts
 */

/** The demo owner's id — 24-char hex, and a real ObjectId: its leading bytes date it to February 2024. */
export const SEED_OWNER_ID = '65dd2bdb923652b7800fe180';

/** The demo (non-admin) user's id — same format and vintage as {@link SEED_OWNER_ID}. */
export const SEED_USER_ID = '65de646a44f861fd83c13f13';

/** The demo editor's id — same format as {@link SEED_OWNER_ID}. */
export const SEED_EDITOR_ID = '65df1a2b3c4d5e6f7a8b9c01';

/** The demo moderator's id — same format as {@link SEED_OWNER_ID}. */
export const SEED_MODERATOR_ID = '65df1a2b3c4d5e6f7a8b9c03';

/** The demo owner's login email. */
export const SEED_OWNER_EMAIL = 'root@root.it';

/**
 * The demo owner's login password — PLAINTEXT; see the file header for why.
 * `NODE_SEED_ADMIN_PASSWORD` overrides it — spelled `ADMIN`, not `OWNER`, because it is shared
 * with the paired frontend's own `.env` and is not this file's to rename alone. The fallback is a
 * real demo value, not a placeholder, since this repo commits its `.env` in the clear and the demo
 * profile is never a production deployment.
 */
export const SEED_OWNER_PASSWORD = process.env.NODE_SEED_ADMIN_PASSWORD ?? 'Demo-Admin1!';

/** The demo user's login email. */
export const SEED_USER_EMAIL = 'customer@example.com';

/**
 * The demo user's login password — PLAINTEXT; see the file header for why. `NODE_SEED_USER_PASSWORD`
 * overrides it, same reasoning as {@link SEED_OWNER_PASSWORD}.
 */
export const SEED_USER_PASSWORD = process.env.NODE_SEED_USER_PASSWORD ?? 'Demo-User1!';

/** The demo editor's login email. */
export const SEED_EDITOR_EMAIL = 'editor@example.com';

/** The demo editor's login password — PLAINTEXT; same reasoning as {@link SEED_OWNER_PASSWORD}. */
export const SEED_EDITOR_PASSWORD = process.env.NODE_SEED_EDITOR_PASSWORD ?? 'Demo-Editor1!';

/** The demo moderator's login email. */
export const SEED_MODERATOR_EMAIL = 'moderator@example.com';

/** The demo moderator's login password — PLAINTEXT; same reasoning as {@link SEED_OWNER_PASSWORD}. */
export const SEED_MODERATOR_PASSWORD =
    process.env.NODE_SEED_MODERATOR_PASSWORD ?? 'Demo-Moderator1!';

/** What `demo-data.json` publishes so the frontend can log in as any demo account. */
export const seedCredentials = {
    owner: { email: SEED_OWNER_EMAIL, password: SEED_OWNER_PASSWORD },
    user: { email: SEED_USER_EMAIL, password: SEED_USER_PASSWORD },
    editor: { email: SEED_EDITOR_EMAIL, password: SEED_EDITOR_PASSWORD },
    moderator: { email: SEED_MODERATOR_EMAIL, password: SEED_MODERATOR_PASSWORD }
} as const;
