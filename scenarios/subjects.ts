/**
 * @module
 * The named ids and credentials a consumer that cannot import module code still needs to point at
 * a specific seeded row — a generated API client collection today, `GET /__test/scenario` once
 * built. Import-free by construction: `scripts/contracts/client-collections-bundle.ts` runs inside
 * `npm run contracts:bundle`, before `api/` exists, so anything it reads has to resolve without
 * pulling in a module's code (which imports the generated `@api/` client — see
 * `scripts/contracts/openapi-bundle.ts` for the cycle that broke `npm ci` the same way).
 *
 * `scenarios/products.ts` and `scenarios/orders.ts` import their own pinned ids from here instead
 * of stating them locally, so each id has exactly one source rather than one the fixture uses and
 * a second a reader like the collections generator has to keep in sync by hand.
 */

import {
    SEED_OWNER_ID,
    SEED_OWNER_EMAIL,
    SEED_OWNER_PASSWORD,
    SEED_USER_ID,
    SEED_USER_EMAIL,
    SEED_USER_PASSWORD
} from '@scenarios/accounts';

/**
 * The catalogue ids, named by what each row is for.
 *
 * `scenarios/products.ts`, `./cart`, `./wishlist` and `./orders` read these instead of repeating a
 * hex string. Each name states the row's product and the branch it exists to exercise, so intent
 * like "only visible products are saved" is checkable by eye where a raw id would just be a claim
 * in a comment.
 */
export const SEED_PRODUCT_IDS = {
    dogFoodStandard: '65dc8a99604c307b702b5ccc',
    heaterSoftDeleted: '65dc8ad8604c307b702b5cd4',
    scratchPostOutOfStock: '65dc9be92f2794d1c16741e1',
    dogBedPremium: '65dcdec2b18ad5e4bd597f0f',
    bundleInactive: '6622c88a5123b1e286f440f8',
    barebones: '67f0a1c2d3e4b5a6c7d8e9f0'
} as const;

/**
 * The three test-critical order ids, named by the branch each exercises —
 * `scenarios/orders.ts`'s own comments say which. `ownerShipped` is the only fixture with shipping
 * columns; `userDeleted` is the soft-deleted one.
 */
export const SEED_ORDER_IDS = {
    ownerFirst: '65de73a69ca05739be2b5e85',
    ownerShipped: '661c795a9e22bcbef63a5832',
    userDeleted: '66b3f0c14d2e8a91c7d4a015'
} as const;

/**
 * The owner and the ordinary user — id, login and, where seeded, one representative row — the pair
 * every generated example that needs a *working* request draws from. Re-exported from
 * `@scenarios/accounts` rather than duplicated: that file is the one place credentials must stay
 * fixed against the paired frontend's own `.env` copy.
 */
export const SUBJECTS = {
    owner: { id: SEED_OWNER_ID, email: SEED_OWNER_EMAIL, password: SEED_OWNER_PASSWORD },
    user: { id: SEED_USER_ID, email: SEED_USER_EMAIL, password: SEED_USER_PASSWORD },
    product: {
        id: SEED_PRODUCT_IDS.dogFoodStandard,
        softDeletedId: SEED_PRODUCT_IDS.heaterSoftDeleted,
        inactiveId: SEED_PRODUCT_IDS.bundleInactive
    },
    order: {
        id: SEED_ORDER_IDS.ownerFirst,
        deletedId: SEED_ORDER_IDS.userDeleted
    }
} as const;
