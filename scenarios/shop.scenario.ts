/**
 * @module
 * The `shop` scenario: the access model and every `shopModules` fixture as its starting rows, then
 * the order book `flows/shop-history.ts` lives through. Discovered by `npm run scenarios:generate`
 * (`scenarios/scenarios.generated.ts`), so the strip deletes this file rather than editing the
 * registry that lists it.
 *
 * See: docs/tools/demo-profile.md
 */

import type { SeedOutcome } from '@scenarios/seed';
import { seedAccessModel } from './accounts';
import { SEED_PRODUCT_IDS } from './product-ids';
import { driveShopHistory } from './flows/shop-history';
import { asWaveEntries, shopModules } from './shop-modules';
import { runInWaves } from './waves';

/**
 * The `shop` scenario's STARTING rows: the access model, then every `shopModules` entry, in the
 * fewest sequential waves its `after` graph allows (`./waves`). Nothing can resolve a caller until
 * there is a shop to be a member of, which is why the access model runs before any of it.
 *
 * A shop seeded and never driven has an empty catalogue shelf — every product starts at
 * `onHand: 0` and takes delivery from the flow run.
 */
const seedShop = (): Promise<SeedOutcome[]> =>
    seedAccessModel()
        .then(() => runInWaves(asWaveEntries(shopModules)))
        .then((outcomes) => outcomes.flat());

/**
 * The `shop` scenario's PINNED subjects: one row id per guarantee a module declares in its own
 * `module.ts` (`AppModule.scenario`).
 *
 * The answer to the manifest's question. `tests/integration/scenarios/shop.test.ts` holds the two
 * equal in both directions, so a guarantee declared and never pinned fails the suite, and so does
 * a subject left behind after the module that wanted it was deleted.
 *
 * Only `products` pins a row here: every other guarantee names a row the flows produce, and
 * those ids exist only once a process has actually run them.
 */
export const SHOP_SUBJECTS: Readonly<Record<string, string>> = {
    'product.softDeleted': SEED_PRODUCT_IDS.heaterSoftDeleted,
    'product.inactive': SEED_PRODUCT_IDS.bundleInactive,
    'product.offSale': SEED_PRODUCT_IDS.bedOffSale,
    'product.outOfStock': SEED_PRODUCT_IDS.scratchPostOutOfStock,
    'product.barebones': SEED_PRODUCT_IDS.barebones,
    'product.inStock': SEED_PRODUCT_IDS.dogBedPremium,
    'product.rich': SEED_PRODUCT_IDS.dogFoodStandard,
    'product.digital': SEED_PRODUCT_IDS.puppyCourseDigital,
    'product.lowStock': SEED_PRODUCT_IDS.bowlLowStock,
    'product.noWithdrawal': SEED_PRODUCT_IDS.bowlNoWithdrawal,
    'product.heavy': SEED_PRODUCT_IDS.catTreeHeavy
};

/** The scenario `scenarios/index.ts` registers under the name `shop`. */
export const scenario = {
    seed: seedShop,
    drive: driveShopHistory,
    subjects: SHOP_SUBJECTS
};
