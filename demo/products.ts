/**
 * @module
 * The catalogue's slice of the demo dataset. `scripts/demo/export-dataset.ts` seeds these rows and
 * publishes what the API actually serves as `db/demo/demo-data.json`, so the paired frontend gets
 * the data without sharing source. A field a record omits falls to `@modules/products/model`'s
 * `default:` — see `@modules/products/fixtures`.
 *
 * Six named rows carry the branch coverage the storefront and repositories actually exercise
 * (soft-deleted, out of stock, inactive, minimal); `./demo-catalog` supplies a further 126 rows
 * combinatorially, so the catalogue reads like a real pet-supply retailer rather than a list of
 * edge cases. Every image comes from `./products-images.generated.json` (`npm run seed:images`) —
 * none is hand-placed. The filler rows share a fixed pool of 20 images by cycling through it
 * (`FILLER_IMAGE_ROLE_KEYS`), so a larger grid never means a new download.
 */

import { FILLER_IMAGE_ROLE_KEYS, FILLER_PRODUCTS, fillerProductId } from './demo-catalog';

/**
 * Re-exported so `./cart`, `./orders` and `./wishlist` can address a specific filler row (for
 * variety beyond the six named products) through this file rather than reaching into
 * `./demo-catalog` directly.
 */
export { fillerProductId } from './demo-catalog';
import productImages from './products-images.generated.json';
import { makeProduct } from '@modules/products/fixtures';
import { productModel } from '@modules/products/model';
import { upsertById, type SeedOutcome, exportCollection } from '@infrastructure/persistence/seed';
import { productRepository } from '@modules/products/repository';

/**
 * The catalogue ids, named by what each row is for.
 *
 * `./cart`, `./wishlist` and `./orders` read these instead of repeating a hex string. Each name
 * states the row's product and the branch it exists to exercise, so intent like "only visible
 * products are saved" is checkable by eye where a raw id would just be a claim in a comment.
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
 * Six named products, chosen to cover the branches the storefront and repositories actually
 * exercise rather than to look like a shop on their own — `./demo-catalog`'s filler rows are what
 * make the catalogue look like a shop. `categories` is non-empty on every RICH record, since a
 * facet endpoint returning `[]` on a fresh install reads as broken rather than empty —
 * `barebones` is the deliberate exception, see its note below.
 */
const namedProducts = [
    makeProduct({
        id: SEED_PRODUCT_IDS.dogFoodStandard,
        title: 'Premium Grain-Free Dog Food, 15kg',
        description:
            'A complete, balanced diet formulated for adult dogs, made with real chicken and rice.',
        price: 68,
        onHand: 30,
        categories: ['dogs', 'food'],
        tags: ['dog-food', 'premium'],
        ...productImages.dogFoodStandard
    }),
    /*
     * The soft-deleted one — exercises the `deletedAt` branch that `isVisibleToCaller` and the
     * repositories' soft-delete filters both check. Exactly one record carries it, independent of
     * the inactive one, so the dataset can tell the two states apart.
     */
    makeProduct({
        id: SEED_PRODUCT_IDS.heaterSoftDeleted,
        title: '150W Ceramic Heat Emitter',
        description:
            'A ceramic heat emitter for reptile terrariums, providing consistent background heat ' +
            'without light. Discontinued — no longer offered for sale.',
        price: 55,
        onHand: 12,
        categories: ['reptiles'],
        tags: ['heating', 'reptile'],
        deletedAt: '2024-02-26T23:34:44.832Z',
        ...productImages.heaterSoftDeleted
    }),
    /*
     * `onHand: 0` on purpose — the storefront needs an out-of-stock badge and checkout needs a
     * refusal to exercise. It's `onHand` itself that is zero, not just availability; the other way
     * to be unbuyable (units held, all reserved) is deliberately not seeded — see `./orders`.
     */
    makeProduct({
        id: SEED_PRODUCT_IDS.scratchPostOutOfStock,
        title: 'Heavy-Duty Cat Scratching Post',
        description:
            'A tall, sisal-wrapped scratching post built to withstand daily use. Currently ' +
            'unavailable — back in stock soon.',
        price: 45,
        onHand: 0,
        categories: ['cats'],
        tags: ['scratching-post', 'heavy-duty'],
        ...productImages.scratchPostOutOfStock
    }),
    makeProduct({
        id: SEED_PRODUCT_IDS.dogBedPremium,
        title: 'Orthopedic Memory Foam Dog Bed',
        description:
            'A supportive memory foam bed designed to ease pressure on joints, suitable for ' +
            'senior and large-breed dogs.',
        price: 84,
        onHand: 45,
        categories: ['dogs'],
        tags: ['dog-bed', 'premium'],
        ...productImages.dogBedPremium
    }),
    /* The inactive one — soft-deleted's independent twin. `publicScope()` requires active AND not
     * deleted, so from outside these two behave identically while remaining distinct states. */
    makeProduct({
        id: SEED_PRODUCT_IDS.bundleInactive,
        title: 'Rabbit Starter Bundle — Hutch, Feeder & Water Bottle',
        description:
            'A complete rabbit housing bundle including hutch, feeder and water bottle. ' +
            'Temporarily disabled while packaging is updated.',
        price: 96,
        onHand: 18,
        categories: ['rabbits', 'bundles'],
        tags: ['bundle', 'rabbit'],
        active: false,
        ...productImages.bundleInactive
    }),
    /*
     * The minimal one — only `title` and `price`, so every optional field falls to the model's
     * defaults, `imageUrl` included. The others are richly populated and can't catch a card or
     * filter chip that wrongly assumes a description, category or image is present. Public on
     * purpose, so it appears in every list the storefront actually renders.
     */
    makeProduct({
        id: SEED_PRODUCT_IDS.barebones,
        title: 'Universal Small Animal Water Bottle',
        price: 9
    })
];

/**
 * The combinatorial filler rows from `./demo-catalog`, each given an id and an image cycled from
 * the fixed 20-image pool — the grid is far larger than that pool, so rows share photos rather
 * than each needing its own.
 */
const fillerProductRows = FILLER_PRODUCTS.map((product, index) => {
    const imageRole = FILLER_IMAGE_ROLE_KEYS[index % FILLER_IMAGE_ROLE_KEYS.length];

    return makeProduct({
        id: fillerProductId(index),
        ...product,
        ...productImages[imageRole as keyof typeof productImages]
    });
});

/** Every demo product: the hand-written catalogue first, then the generated filler rows. */
export const productFixtures = [...namedProducts, ...fillerProductRows];

/**
 * One demo product by id, or a thrown error naming what's missing.
 *
 * `./orders` needs the actual record — it embeds a product SNAPSHOT, not a reference — so the
 * throw lives here, next to the data it validates, instead of every consumer reimplementing it.
 * Returns the fixture type directly; reshaping to `orders`' own snapshot type is the caller's job.
 * @throws {Error} when no demo product carries that id
 */
export const seedProductById = (productId: string): (typeof productFixtures)[number] => {
    const product = productFixtures.find((candidate) => candidate._id.toString() === productId);
    if (!product) throw new Error(`seed fixtures: no product ${productId} in the demo catalogue`);

    return product;
};

/** Seed this collection. Declared in `./index`; called by `db/demo/index.ts`. */
export const seedProductsCollection = (): Promise<SeedOutcome[]> =>
    Promise.all(productFixtures.map((product) => upsertById(productRepository, product)));

/**
 * Read the seeded catalogue back as the API serves it — `./index` declares this, and
 * `scripts/demo/export-dataset.ts` calls it. Sorted by `_id` so the published file is byte-stable
 * across runs rather than dependent on Mongo's natural order.
 */
export const exportSeededProducts = async (): Promise<Record<string, unknown[]>> => ({
    products: await exportCollection(productModel, { _id: 1 })
});
