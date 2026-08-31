/**
 * @module
 * The catalogue's slice of the demo dataset, stated here so `rm -rf src/modules/products` removes
 * it too. `scripts/export-demo-dataset.ts` seeds these rows and publishes what the API actually
 * serves as `db/demo/demo-data.json`, so the paired frontend gets the data without sharing source.
 * A field a record omits falls to `./model`'s `default:` — see `./fixtures`.
 */

import { makeProduct } from './fixtures';
import { productModel } from './model';
import { upsertById, type SeedOutcome, exportCollection } from '@infrastructure/persistence/seed';
import { productRepository } from './repository';

/**
 * The catalogue ids, named by what each row is for.
 *
 * `cart`, `wishlist` and `orders` read these via `@modules/products/demo` instead of repeating a
 * hex string — a name like `panino` makes intent like "only visible products are saved" checkable
 * by eye, where a raw id would just be a claim in a comment.
 */
export const SEED_PRODUCT_IDS = {
    panino: '65dc8a99604c307b702b5ccc',
    carinoSoftDeleted: '65dc8ad8604c307b702b5cd4',
    micionaOutOfStock: '65dc9be92f2794d1c16741e1',
    pufettino: '65dcdec2b18ad5e4bd597f0f',
    bundleInactive: '6622c88a5123b1e286f440f8',
    barebones: '67f0a1c2d3e4b5a6c7d8e9f0'
} as const;

/**
 * Six products, chosen to cover the branches the storefront and repositories actually exercise
 * rather than to look like a shop. `categories` is non-empty on every RICH record, since a facet
 * endpoint returning `[]` on a fresh install reads as broken rather than empty — `barebones` is
 * the deliberate exception, see its note below.
 */
export const productFixtures = [
    makeProduct({
        id: SEED_PRODUCT_IDS.panino,
        title: 'Sallyno Panino',
        description: 'Piccolo Sallyno panino. Da mangiare di coccole',
        price: 100,
        onHand: 25,
        categories: ['food'],
        tags: ['sallyno', 'cute'],
        imageUrl: '/images/seed/ad2e01890eebf72d06481c4fac3522ac.jpg'
    }),
    /*
     * The soft-deleted one — exercises the `deletedAt` branch that `isVisibleToCaller` and the
     * repositories' soft-delete filters both check. Exactly one record carries it, independent of
     * the inactive one, so the dataset can tell the two states apart.
     */
    makeProduct({
        id: SEED_PRODUCT_IDS.carinoSoftDeleted,
        title: 'Sallyno Carino',
        description: 'Sallyno incredibilmente carino. Illegale in 400 paesi. Soft deleted product.',
        price: 50,
        onHand: 10,
        categories: ['pets'],
        tags: ['sallyno', 'illegal'],
        imageUrl: '/images/seed/96346b77daf138a279677cb75c400ee9.jpg',
        deletedAt: '2024-02-26T23:34:44.832Z'
    }),
    /*
     * `onHand: 0` on purpose — the storefront needs an out-of-stock badge and checkout needs a
     * refusal to exercise. It's `onHand` itself that is zero, not just availability; the other way
     * to be unbuyable (units held, all reserved) is deliberately not seeded — see `orders/demo.ts`.
     */
    makeProduct({
        id: SEED_PRODUCT_IDS.micionaOutOfStock,
        title: 'Miciona inutile',
        description: 'Miciona inutile, piccolo catorcio che come lavoro produce pelo a non finire',
        price: 1,
        onHand: 0,
        categories: ['pets'],
        tags: ['micini', 'useless'],
        imageUrl: '/images/seed/60de15db7aed7174ef2d53d21e1f57a5.jpg'
    }),
    makeProduct({
        id: SEED_PRODUCT_IDS.pufettino,
        title: 'Micino pufettino',
        description: 'Micino pufettino, incredibilmente pufino. Illegale in 400 paesi.',
        price: 77,
        onHand: 40,
        categories: ['pets'],
        tags: ['micini', 'cute', 'illegal'],
        imageUrl: '/images/seed/f12ba2e44fe347010397f1dcba399808.jpg'
    }),
    /* The inactive one — soft-deleted's independent twin. `publicScope()` requires active AND not
     * deleted, so from outside these two behave identically while remaining distinct states. */
    makeProduct({
        id: SEED_PRODUCT_IDS.bundleInactive,
        title: 'Bundle micini',
        description: 'Produttori di rumori molesti a tutte le ore. Inactive product.',
        price: 40,
        onHand: 15,
        categories: ['pets', 'bundles'],
        tags: ['micini', 'noisy'],
        active: false,
        imageUrl: '/images/seed/043cf5b2517fc99ce9a2c2f84288416d.jpg'
    }),
    /*
     * The minimal one — only `title` and `price`, so every optional field falls to `./model`'s
     * defaults. The other five are richly populated and can't catch a card or filter chip that
     * wrongly assumes a description or category is present. Public on purpose, so it appears in
     * every list the storefront actually renders.
     */
    makeProduct({
        id: SEED_PRODUCT_IDS.barebones,
        title: 'Scatolone',
        price: 5
    })
];

/**
 * One demo product by id, or a thrown error naming what's missing.
 *
 * `orders` needs the actual record — it embeds a product SNAPSHOT, not a reference — so the throw
 * lives here, next to the data it validates, instead of every consumer reimplementing it. Returns
 * the fixture type directly; reshaping to `orders`' own snapshot type is the caller's job.
 */
export const seedProductById = (productId: string): (typeof productFixtures)[number] => {
    const product = productFixtures.find((candidate) => candidate._id.toString() === productId);
    if (!product) throw new Error(`seed fixtures: no product ${productId} in the demo catalogue`);

    return product;
};

/** Seed this module's collection. Declared in `module.ts`; called by `db/demo/index.ts`. */
export const seedProductsCollection = (): Promise<SeedOutcome[]> =>
    Promise.all(productFixtures.map((product) => upsertById(productRepository, product)));

/**
 * Read the seeded catalogue back as the API serves it — `module.ts` declares this, and
 * `scripts/export-demo-dataset.ts` calls it. Sorted by `_id` so the published file is byte-stable across
 * runs rather than dependent on Mongo's natural order.
 */
export const exportSeededProducts = async (): Promise<Record<string, unknown[]>> => ({
    products: await exportCollection(productModel, { _id: 1 })
});
