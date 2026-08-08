/*
 * Repair `imageUrl`s stored with Windows path separators.
 *
 * Rows written from multer's `file.path` carry `path.join()`'s separator, so on Windows an upload
 * was recorded as `\images\x.jpg`. A URL path has no backslashes — a browser reads them as
 * literal filename characters — so every such row points at a file the server will 404.
 *
 * Two separate rewrites, because the two are not the same fix:
 *
 *   - SEPARATORS. Any `\` in an `imageUrl` becomes `/`. Safe on every row: `\` is not legal in a
 *     URL path, so a document containing one is broken by definition, whatever produced it.
 *   - SEED FIXTURES. The six demo images moved from `public/images/` to `public/images/seed/`,
 *     so the rows the seeder wrote need their directory updated too. Matched by exact filename
 *     against the known fixture list rather than by pattern — a user upload that happens to sit
 *     at `/images/<hex>.jpg` must NOT be redirected into the fixture directory.
 *
 * `$regex` guards both directions so re-running touches nothing, which `migrate-mongo status`
 * does not guarantee on its own.
 *
 * Products carry `imageUrl` directly and again inside every order's embedded product snapshot;
 * users carry one too. All three are rewritten — an order snapshot is a historical record, but a
 * broken image in it is not history worth preserving.
 */

/* The fixtures `db/seeds/fixtures.ts` references, which moved into `/images/seed/`. */
const SEED_IMAGE_FILENAMES = [
    '043cf5b2517fc99ce9a2c2f84288416d.jpg',
    '60de15db7aed7174ef2d53d21e1f57a5.jpg',
    '96346b77daf138a279677cb75c400ee9.jpg',
    '9726c4217f5998511f372afab4800ac8.jpg',
    'ad2e01890eebf72d06481c4fac3522ac.jpg',
    'f12ba2e44fe347010397f1dcba399808.jpg'
];

/**
 * Rewrite one string field across a collection, applying `mapper` to each distinct value found.
 *
 * Done as read-distinct-then-targeted-update rather than an aggregation pipeline update, so this
 * runs on MongoDB 4.0 as well — a boilerplate should not force a server upgrade to migrate.
 *
 * `arrayElement` is mandatory when the field sits inside an array. A dotted path resolves
 * differently on the two sides of an update: `{ 'items.product.imageUrl': value }` MATCHES fine,
 * because a query implicitly searches every array element, but `$set` on the same path is
 * rejected — the server cannot know which element was meant, and answers `Cannot create field
 * 'product' in element {items: [...]}`, failing the whole migration. Naming the element
 * (`items.$[item].product.imageUrl`, with an `arrayFilters` entry selecting the matching ones) is
 * what makes the write addressable. `arrayFilters` is MongoDB 3.6+, so it keeps the 4.0 floor
 * above intact.
 */
const rewriteField = async (db, collectionName, field, match, mapper, arrayElement) => {
    const collection = db.collection(collectionName);
    const values = await collection.distinct(field, match);

    for (const value of values) {
        const next = mapper(value);
        if (next === value) continue;

        if (arrayElement) {
            await collection.updateMany(
                { [field]: value },
                { $set: { [arrayElement.path]: next } },
                { arrayFilters: [{ [arrayElement.filter]: value }] }
            );
            continue;
        }

        await collection.updateMany({ [field]: value }, { $set: { [field]: next } });
    }
};

/* Addresses `imageUrl` inside each element of an order's `items` array. */
const ORDER_ITEM_ELEMENT = {
    path: 'items.$[item].product.imageUrl',
    filter: 'item.product.imageUrl'
};

const toPosix = (value) => value.replace(/\\/g, '/');

const intoSeedDirectory = (value) => {
    const filename = value.slice(value.lastIndexOf('/') + 1);
    return SEED_IMAGE_FILENAMES.includes(filename) ? `/images/seed/${filename}` : value;
};

module.exports = {
    async up(db) {
        const backslashed = { $regex: '\\\\' };
        await rewriteField(db, 'products', 'imageUrl', { imageUrl: backslashed }, toPosix);
        await rewriteField(db, 'users', 'imageUrl', { imageUrl: backslashed }, toPosix);
        await rewriteField(
            db,
            'orders',
            'items.product.imageUrl',
            { 'items.product.imageUrl': backslashed },
            toPosix,
            ORDER_ITEM_ELEMENT
        );

        /* Separators first, so a `\images\<fixture>.jpg` row is matched by the move below too. */
        const atImagesRoot = { $regex: '^/images/[^/]+$' };
        await rewriteField(
            db,
            'products',
            'imageUrl',
            { imageUrl: atImagesRoot },
            intoSeedDirectory
        );
        await rewriteField(db, 'users', 'imageUrl', { imageUrl: atImagesRoot }, intoSeedDirectory);
        await rewriteField(
            db,
            'orders',
            'items.product.imageUrl',
            { 'items.product.imageUrl': atImagesRoot },
            intoSeedDirectory,
            ORDER_ITEM_ELEMENT
        );
    },

    async down() {
        /*
         * Deliberately empty.
         *
         * The `up` is a repair, not a schema change: it turns URLs that 404 into URLs that
         * resolve. Reversing it would mean reintroducing broken data, and the information needed
         * to do so faithfully — which rows were backslashed on which platform — is not recoverable
         * from the result. Rolling back past this migration leaves the corrected URLs in place,
         * which the old code reads perfectly well.
         */
    }
};
