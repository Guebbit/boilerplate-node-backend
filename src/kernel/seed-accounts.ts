/**
 * Who the two demo accounts are: their ids, and how to log in as them.
 *
 * ## Why this is in the kernel and not in `users`
 *
 * Four modules need a piece of it and only one of them owns the record. `users` seeds the accounts;
 * `orders` stores the address an order was sent to; `cart` and `wishlist` each seed a row that
 * belongs to a person and need that person's id to point at. Reaching into `@modules/users` for it
 * would be a registry edge — three new ones, in fact, one of them a `shared-kernel` — bought for
 * six string literals that are pure data.
 *
 * The alternative was worse in a different way: repeating the ids in four files, where a drift is a
 * dangling reference nothing catches until a demo renders an empty page. `scripts/export-seed.ts`
 * still checks referential integrity across the whole dataset, because ids arrive from elsewhere
 * too — but the ids that ARE shared are shared once, from here.
 *
 * Note what is deliberately not here: the account RECORDS. A sibling gets the handle it needs to
 * name a person without taking on the shape of a user, which is the difference between a constant
 * in the kernel and a cross-module import of `userFixtures`.
 *
 * ## Why the credentials must never be randomised
 *
 * `cy.loginAs()` in the paired frontend types them into a real login form, and both READMEs quote
 * them. Everything else about the demo dataset can move; these are the part a human reads off a
 * page and types.
 *
 * The password is PLAINTEXT on purpose. `userSchema`'s pre-save hook hashes it on the way in, so a
 * hash written here would drift from that hook and lose its plaintext — which is exactly what once
 * happened to the `gino@pino.it` fixture. It never reaches an API response: `password` is
 * `select: false` and `applyUserTransform` omits it, which is why `scripts/export-seed.ts` carries
 * these into `demo-data.json` separately instead of reading them back off a serialized user.
 */

/** 24-char hex, and a real ObjectId: its leading bytes date the account to February 2024. */
export const SEED_ADMIN_ID = '65dd2bdb923652b7800fe180';
export const SEED_USER_ID = '65de646a44f861fd83c13f13';

export const SEED_ADMIN_EMAIL = 'root@root.it';
export const SEED_ADMIN_PASSWORD = 'rootroot';
export const SEED_USER_EMAIL = 'gino@pino.it';
export const SEED_USER_PASSWORD = 'password';

/** What `demo-data.json` publishes so the frontend can log in as either demo account. */
export const seedCredentials = {
    admin: { email: SEED_ADMIN_EMAIL, password: SEED_ADMIN_PASSWORD },
    user: { email: SEED_USER_EMAIL, password: SEED_USER_PASSWORD }
} as const;
