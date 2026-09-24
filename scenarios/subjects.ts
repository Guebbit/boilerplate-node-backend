/**
 * @module
 * The named ids and credentials a consumer that cannot import module code still needs to point at
 * a specific seeded row: a generated API client collection, and `GET /__test/scenario`'s
 * `subjects`. Import-free by construction —
 * `scripts/contracts/client-collections-bundle.ts` runs inside `npm run contracts:bundle`, before
 * `api/` exists, so anything it reads has to resolve without pulling in a module's code (which
 * imports the generated `@api/` client — see `scripts/contracts/openapi-bundle.ts` for the cycle
 * that broke `npm ci` the same way).
 *
 * ONLY PINNED ROWS LIVE HERE. Orders, payments and shipments are produced by driving the app
 * (`scenarios/flows/`), so their ids are minted at boot and recorded by the runner instead;
 * `scenarios/index.ts`'s `buildScenario` merges the two into one map. A consumer that wants an
 * order id asks `GET /__test/scenario`, or chains a list request — it cannot be a literal.
 */

import {
    SEED_ADMIN_ID,
    SEED_ADMIN_EMAIL,
    SEED_ADMIN_PASSWORD,
    SEED_USER_ID,
    SEED_USER_EMAIL,
    SEED_USER_PASSWORD
} from '@scenarios/accounts';

/**
 * The catalogue ids, named by what each row is for.
 *
 * `scenarios/products.ts`, `./wishlist` and `./flows/shop-history.ts` read these instead of
 * repeating a hex string. Each name states the row's product and the branch it exists to
 * exercise, so intent like "only visible products are saved" is checkable by eye where a raw id
 * would just be a claim in a comment.
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
 * The `shop` scenario's PINNED subjects: one row id per guarantee a module declares in its own
 * `module.ts` (`AppModule.scenario`).
 *
 * The answer to the manifest's question. `tests/integration/scenarios/shop.test.ts` holds the two
 * equal in both directions, so a guarantee declared and never pinned fails the suite, and so does
 * a subject left behind after the module that wanted it was deleted.
 *
 * Only `products` appears: every other guarantee names a row the flows produce, and those ids
 * exist only once a process has actually run them.
 */
export const SHOP_SUBJECTS: Readonly<Record<string, string>> = {
    'product.softDeleted': SEED_PRODUCT_IDS.heaterSoftDeleted,
    'product.inactive': SEED_PRODUCT_IDS.bundleInactive,
    'product.outOfStock': SEED_PRODUCT_IDS.scratchPostOutOfStock,
    'product.barebones': SEED_PRODUCT_IDS.barebones,
    'product.inStock': SEED_PRODUCT_IDS.dogBedPremium,
    'product.rich': SEED_PRODUCT_IDS.dogFoodStandard
};

/**
 * The admin and the ordinary user — id, login and, where seeded, one representative row — the pair
 * every generated example that needs a *working* request draws from. Re-exported from
 * `@scenarios/accounts` rather than duplicated: that file is the one place credentials must stay
 * fixed against the paired frontend's own `.env` copy.
 */
export const SUBJECTS = {
    admin: { id: SEED_ADMIN_ID, email: SEED_ADMIN_EMAIL, password: SEED_ADMIN_PASSWORD },
    user: { id: SEED_USER_ID, email: SEED_USER_EMAIL, password: SEED_USER_PASSWORD },
    product: {
        id: SEED_PRODUCT_IDS.dogFoodStandard,
        softDeletedId: SEED_PRODUCT_IDS.heaterSoftDeleted,
        inactiveId: SEED_PRODUCT_IDS.bundleInactive
    }
} as const;
