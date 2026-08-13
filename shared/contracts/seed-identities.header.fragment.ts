/*
 * The demo dataset's IDENTITIES — the half of the seed both repos have to agree on.
 *
 * SHARED FILE — this file is byte-identical in `boilerplate-node-api-mongodb-mongoose` and
 * `boilerplate-vue-frontend`, and `diff` answers "have the seeds drifted?":
 *
 *   diff boilerplate-node-api-mongodb-mongoose/db/seeds/seed-identities.ts \
 *        boilerplate-vue-frontend/tests/support/mocks/seed-identities.ts
 *
 * ASSEMBLED FROM FRAGMENTS — do not hand-edit. The backend authors it: each domain owns its own
 * records in `src/modules/<name>/seed-identities.fragment.ts`, so deleting a module takes its half
 * of the dataset with it, and `npm run contracts:bundle` rebuilds this file. The frontend receives
 * the result as a copy and authors nothing.
 *
 * Why it exists. The backend seeds Mongo from `./fixtures`; the frontend's MSW layer builds the
 * same dataset in `tests/support/mocks/mockProfiles.ts`. Without a shared file the claim that they
 * hold the same records rests on a comment, and a drift is silent: a mock that returns 5 products
 * to everyone while the real API returns 3 to non-admins still passes every spec that asserts the
 * mock's number.
 *
 * Why only identities, and not the whole fixture. The two sides need genuinely different SHAPES
 * from the same facts:
 *
 *   - backend  → mongoose documents: `_id` as `Types.ObjectId`, plaintext passwords the model's
 *                pre-save hook hashes, an embedded `cart`, denormalised product snapshots inside
 *                orders
 *   - frontend → API response entities: `id` as a string, no password anywhere, `createdAt` /
 *                `updatedAt` stamped at build time, orders' totals computed by `mockOrderMath`
 *
 * So each repo keeps its own mapper over this file. What is shared is what a drift would actually
 * break: ids, emails, admin flags, titles, prices, active/deleted state, and which product appears
 * in whose cart and whose order.
 *
 * This file must stay DEPENDENCY-FREE. It is loaded by ts-jest/CommonJS and tsx on the backend and
 * by Vite/vitest ESM on the frontend; a single import (mongoose being the obvious temptation)
 * would make it unloadable on one side. Plain data only — strings, numbers, booleans. Dates are
 * ISO strings, and each side converts to whatever it needs.
 */

/* Credentials the frontend's e2e specs and both READMEs quote. `cy.loginAs()` types these into a
 * real form, so they are the one part of the dataset that must never be randomised. */
export const SEED_ADMIN_EMAIL = 'root@root.it';
export const SEED_ADMIN_PASSWORD = 'rootroot';
export const SEED_USER_EMAIL = 'gino@pino.it';
export const SEED_USER_PASSWORD = 'password';

export interface ISeedCartItem {
    productId: string;
    quantity: number;
}
