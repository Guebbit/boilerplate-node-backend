/**
 * @module
 * The demo dataset's registry — one entry per module with demo fixtures, keyed the same way
 * `enabledModules` names them. Every file in this folder imports its module's repository, model
 * and fixtures directly (never the other way), so a production image can omit this whole folder
 * and nothing under `src/` notices.
 *
 * Walked by `app/demo.ts`, `db/demo/index.ts` and `scripts/demo/{export-dataset,assemble}.ts` —
 * none of which import a module for any other reason. `tests/cross-cutting/seed-conformance.test.ts`
 * refuses an entry whose name `enabledModules` does not also carry.
 *
 * See: docs/tools/demo-profile.md
 */

import { seedAddressBooksCollection, exportSeededAddressBooks } from './account';
import { seedAuditLogsCollection, exportSeededAuditLogs } from './audit-logs';
import { seedCartsCollection, exportSeededCarts } from './cart';
import { seedLocalesCollection, exportSeededLocales } from './locales';
import { seedOrdersCollection, exportSeededOrders } from './orders';
import { seedProductsCollection, exportSeededProducts } from './products';
import { seedUsersCollection, exportSeededUsers } from './users';
import { seedWishlistsCollection, exportSeededWishlists } from './wishlist';
import type { SeedOutcome } from '@infrastructure/persistence/seed';

/**
 * What a published collection is to the consumer reading it.
 *
 * `response` — a GET answers with this row as it stands, so a mock may hand it straight back.
 * `stored` — no endpoint serves the row raw; a consumer returning it verbatim would describe an
 * API that does not exist.
 *
 * See: docs/tools/demo-profile.md
 */
export type DemoShape = 'response' | 'stored';

/** One module's demo registration: how to seed it, how to read it back, and what it publishes. */
export interface DemoModule {
    /** Write this module's slice of the demo dataset. Called only by `db/demo/index.ts`. */
    seed: () => Promise<SeedOutcome[]>;

    /**
     * Read this module's seeded rows back in the shape the API serves them, keyed by collection.
     *
     * **Must read back through the model's `toJSON`** — the real serializer — rather than
     * returning the fixtures it wrote. Returning fixtures publishes a guess labelled as truth.
     */
    export: () => Promise<Record<string, unknown[]>>;

    /**
     * One entry per collection `export` returns, published as `_meta.shapes`.
     *
     * Stated rather than derived: a matcher would label the `locales` rows `response`, since a
     * stored language happens to parse against the CREATE response, and a confidently wrong label
     * is worse than none.
     */
    shapes: Readonly<Record<string, DemoShape>>;
}

/** Every module with demo fixtures. Replaces what each `module.ts` used to carry as `seeds`,
 * `seedExport` and `demoShapes` — the pairs collapsed into one table. */
export const demoModules: Readonly<Record<string, DemoModule>> = {
    account: {
        seed: seedAddressBooksCollection,
        export: exportSeededAddressBooks,
        /* A book is never served raw: `GET /account/addresses` answers `{ addresses: [...] }`,
         * which carries the book's `items` and nothing else it holds. */
        shapes: { addressBooks: 'stored' }
    },
    'audit-logs': {
        seed: seedAuditLogsCollection,
        export: exportSeededAuditLogs,
        // Empty on purpose — see `demo/audit-logs.ts`'s own docblock: a TTL-backed, `now`-relative
        // collection cannot join a byte-stable published dataset.
        shapes: {}
    },
    cart: {
        seed: seedCartsCollection,
        export: exportSeededCarts,
        /* `GET /cart` answers the caller's own cart with its lines resolved against the
         * catalogue, so the stored row is the input to that response rather than the response. */
        shapes: { carts: 'stored' }
    },
    locales: {
        seed: seedLocalesCollection,
        export: exportSeededLocales,
        /* None of the three rows is served raw. `GET /locales` answers a composed capabilities
         * envelope, `GET /locales/:locale/messages` answers a nested tree built from the flat
         * entries, and a translation row is only ever read resolved into a product's own `title`/
         * `description`, or as one entry of the admin `GET /translations/{entityType}/{id}` list. */
        shapes: { locales: 'stored', localeEntries: 'stored', translations: 'stored' }
    },
    orders: {
        seed: seedOrdersCollection,
        export: exportSeededOrders,
        /* `GET /orders/:id` answers the serialized document as it stands, totals included. */
        shapes: { orders: 'response' }
    },
    products: {
        seed: seedProductsCollection,
        export: exportSeededProducts,
        /* `GET /products/:id` answers the serialized document as it stands. */
        shapes: { products: 'response' }
    },
    users: {
        seed: seedUsersCollection,
        export: exportSeededUsers,
        /* `GET /users/:id` answers the serialized document as it stands. */
        shapes: { users: 'response' }
    },
    wishlist: {
        seed: seedWishlistsCollection,
        export: exportSeededWishlists,
        /* `GET /wishlist` answers the caller's own list, resolved against the catalogue. */
        shapes: { wishlists: 'stored' }
    }
};

/**
 * Seed every module — `db/demo/index.ts` and `scripts/demo/export-dataset.ts` both call this
 * instead of their own `Promise.all(Object.values(demoModules).map(...))`, so the ordering fix
 * lives in exactly one place.
 *
 * `locales` MUST finish first, not join the concurrent batch: `products.seed()` writes its rows'
 * `translations` through `planTranslations`/`writeTranslations`, and `planSlot`
 * (`@modules/locales/services/translations.ts`) requires every locale in that write — including
 * the fallback locale itself — to already exist as an ACTIVE row. A `Promise.all` over every
 * module would race `products` against `locales` writing that row, and lose it as often as not.
 * No other module reads another module's write, which is what keeps the rest of the table
 * concurrent.
 */
export const seedAllDemoModules = (): Promise<SeedOutcome[]> =>
    demoModules.locales.seed().then((localeOutcomes) =>
        Promise.all(
            Object.entries(demoModules)
                .filter(([name]) => name !== 'locales')
                .map(([, demoModule]) => demoModule.seed())
        ).then((restOutcomes) => [localeOutcomes, ...restOutcomes].flat())
    );
