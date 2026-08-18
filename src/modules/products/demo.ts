/**
 * The catalogue's slice of the demo dataset.
 *
 * The records are stated HERE, in the module that owns them, so `rm -rf src/modules/products` takes
 * the demo catalogue with it. They used to live in a `seed-identities.fragment.ts` beside this file
 * that no module could import — a text slice concatenated into one cross-repo file — because the
 * paired frontend needed the same records and the only way to give them to it was to share source.
 * It no longer shares source: `scripts/export-seed.ts` seeds these rows and publishes what the API
 * actually serves as `db/demo/demo-data.json`, so the facts can live in one normal TypeScript file
 * that this module's own code imports like any other.
 *
 * Every field a record does not state is left to `./model`'s `default:` — see `./factory`.
 */

import { makeProduct } from './factory';
import { productModel } from './model';
import { upsertById, type SeedOutcome } from '@infrastructure/persistence/seed';
import { productRepository } from './repository';

/**
 * The catalogue ids, named by what makes each row worth having.
 *
 * `cart`, `wishlist` and `orders` all seed rows pointing at products, and all three declare a
 * `conformist` edge on this module, so they read these through `@modules/products/demo` rather
 * than repeating a hex string. Naming them is the part that pays: `wishlist` saying it stores
 * `panino` and `pufettino` makes "only publicly visible products are saved" checkable by eye,
 * where `65dc8a99…` and `65dcdec2…` made it a claim in a comment.
 */
export const SEED_PRODUCT_IDS = {
    panino: '65dc8a99604c307b702b5ccc',
    carinoSoftDeleted: '65dc8ad8604c307b702b5cd4',
    micionaOutOfStock: '65dc9be92f2794d1c16741e1',
    pufettino: '65dcdec2b18ad5e4bd597f0f',
    bundleInactive: '6622c88a5123b1e286f440f8',
    barebones: '67f0a1c2d3e4b5a6c7d8e9f0'
} as const;

/*
 * Six products, chosen to cover the branches the storefront and the repositories actually have
 * rather than to look like a shop.
 *
 * `categories` is non-empty on every RICH record: `GET /products/categories` and the storefront's
 * filter chips need something to show out of the box, and a facet endpoint that returns `[]` on a
 * fresh install reads as broken rather than as empty. `barebones` is the deliberate exception —
 * see its note below.
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
     * The soft-deleted one. `isVisibleToCaller` on the frontend and the repositories' soft-delete
     * filters here both branch on `deletedAt`, and a branch with no fixture behind it is a branch
     * nothing tests. Exactly one record carries it, for the same reason exactly one is inactive:
     * the two states are independent and the dataset has to be able to tell them apart.
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
     * `onHand: 0` on purpose. The storefront needs an out-of-stock badge to render and checkout
     * needs a refusal to demonstrate; a dataset where nothing is ever scarce can exercise neither.
     * Note that it is the ONHAND that is zero, not merely the availability — this row is out of
     * stock because there is nothing there. The other way to be unbuyable, units present but all
     * spoken for, is deliberately NOT seeded: it only exists once someone has checked out, and
     * `orders/demo.ts` explains why inventing it here would be both racy and untrue.
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
     * The minimal one — `title` and `price` and nothing else, so every optional field lands on
     * `./model`'s `default:`: an empty `description`, empty `categories`, empty `tags`, the
     * placeholder `imageUrl`, `onHand` at 100.
     *
     * The four above are all richly populated, which makes them unable to catch the failure this
     * one exists for: a storefront card that assumes a description to truncate, or a filter chip
     * row that assumes at least one category, renders blank or throws on a record the API can
     * legitimately answer with — a product created through `POST /products` with only the required
     * fields is exactly this shape. It is PUBLIC on purpose; hiding it behind `active: false`
     * would keep it out of every list the storefront actually renders.
     */
    makeProduct({
        id: SEED_PRODUCT_IDS.barebones,
        title: 'Scatolone',
        price: 5
    })
];

/**
 * One demo product, by id, or a thrown error naming the id that is missing.
 *
 * The question `orders` actually asks — it seeds order lines that embed a product SNAPSHOT, so it
 * needs the record rather than a reference to it. Published as a lookup rather than as the array
 * because the throw belongs next to the data it validates: an order pointing at a product nobody
 * wrote is a corrupt fixture, and it should stop the seeder rather than write an order whose line
 * renders as a blank row. A second consumer inherits that instead of reimplementing it.
 *
 * The caller reshapes. `orders` embeds its own `OrderSnapshotInput`, and returning that type from
 * here would make the catalogue depend on the order book to describe its own rows.
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
 * `scripts/export-seed.ts` calls it. Sorted by `_id` so the published file is byte-stable across
 * runs rather than dependent on Mongo's natural order.
 */
export const exportSeededProducts = async (): Promise<Record<string, unknown[]>> => ({
    products: await productModel
        .find()
        .sort({ _id: 1 })
        .exec()
        .then((documents) => documents.map((document_) => document_.toJSON()))
});
