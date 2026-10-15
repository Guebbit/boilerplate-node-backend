/**
 * @module
 * The pinned catalogue ids, kept apart from `./subjects.ts` so the generated API collections can
 * read them without loading a module: this file imports nothing. It belongs to `products` — the
 * strip deletes it with the shop, and everything that names it goes with it.
 */

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
    barebones: '67f0a1c2d3e4b5a6c7d8e9f0',
    puppyCourseDigital: '70f0a1c2d3e4b5a6c7d8e9f1',
    bowlLowStock: '70f0a1c2d3e4b5a6c7d8e9f3',
    bowlNoWithdrawal: '70f0a1c2d3e4b5a6c7d8e9f4',
    catTreeHeavy: '70f0a1c2d3e4b5a6c7d8e9f2',
    bedOffSale: '70f0a1c2d3e4b5a6c7d8e9f5'
} as const;
