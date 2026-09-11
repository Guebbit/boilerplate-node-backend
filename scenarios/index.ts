/**
 * @module
 * The demo dataset's registry — one entry per module with demo data, keyed the same way
 * `enabledModules` names them. Every file in this folder imports its module's repository, model
 * and factories directly (never the other way), so a production image can omit this whole folder
 * and nothing under `src/` notices.
 *
 * Walked by `app/demo.ts`, `scenarios/apply.ts` and
 * `scenarios/build/{export-dataset,assemble}.ts` — none of which import a module for any other
 * reason. `tests/cross-cutting/scenario-fixtures.test.ts` refuses an entry whose name
 * `enabledModules` does not also carry.
 *
 * See: docs/tools/demo-profile.md
 */

import { seedAddressBooksCollection, exportSeededAddressBooks } from './account';
import { seedAuditLogsCollection, exportSeededAuditLogs } from './audit-logs';
import { seedCartsCollection, exportSeededCarts } from './cart';
import { seedLocalesCollection, exportSeededLocales } from './locales';
import { seedOrdersCollection, exportSeededOrders } from './orders';
import { seedProductsCollection, exportSeededProducts, checkProductGuarantees } from './products';
import { seedUsersCollection, exportSeededUsers } from './users';
import { seedWebhooksCollection, exportSeededWebhooks } from './webhooks';
import { seedWishlistsCollection, exportSeededWishlists } from './wishlist';
import type { SeedOutcome } from '@infrastructure/persistence/seed';

/** One module's demo registration: how to seed it, how to read it back. */
export interface DemoModule {
    /** Write this module's slice of the demo dataset. Called only by `scenarios/apply.ts`. */
    seed: () => Promise<SeedOutcome[]>;

    /**
     * Read this module's seeded rows back in the shape the API serves them, keyed by collection.
     *
     * **Must read back through the model's `toJSON`** — the real serializer — rather than
     * returning the fixtures it wrote. Returning fixtures publishes a guess labelled as truth.
     */
    export: () => Promise<Record<string, unknown[]>>;

    /**
     * Which of this module's `scenario.shop` guarantees (its own `module.ts`) the currently
     * seeded database actually satisfies. Absent for a module that declares none —
     * `scenarios/check.ts` only calls this for a module whose manifest lists something.
     */
    checkGuarantees?: () => Promise<string[]>;
}

/** Every module with demo fixtures. Replaces what each `module.ts` used to carry as `seeds` and
 * `seedExport` — the pair collapsed into one table. */
export const demoModules: Readonly<Record<string, DemoModule>> = {
    account: {
        seed: seedAddressBooksCollection,
        export: exportSeededAddressBooks
    },
    'audit-logs': {
        seed: seedAuditLogsCollection,
        export: exportSeededAuditLogs
    },
    cart: {
        seed: seedCartsCollection,
        export: exportSeededCarts
    },
    locales: {
        seed: seedLocalesCollection,
        export: exportSeededLocales
    },
    orders: {
        seed: seedOrdersCollection,
        export: exportSeededOrders
    },
    products: {
        seed: seedProductsCollection,
        export: exportSeededProducts,
        checkGuarantees: checkProductGuarantees
    },
    users: {
        seed: seedUsersCollection,
        export: exportSeededUsers
    },
    webhooks: {
        seed: seedWebhooksCollection,
        export: exportSeededWebhooks
    },
    wishlist: {
        seed: seedWishlistsCollection,
        export: exportSeededWishlists
    }
};

/**
 * Seed every module — `scenarios/apply.ts` and `scenarios/build/export-dataset.ts` both call this
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
