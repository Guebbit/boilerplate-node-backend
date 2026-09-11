/**
 * @module
 * The demo dataset's registry — one entry per module with demo data, keyed the same way
 * `enabledModules` names them. Every file in this folder imports its module's repository, model
 * and factories directly (never the other way), so a production image can omit this whole folder
 * and nothing under `src/` notices.
 *
 * Walked by `app/demo.ts` and `scenarios/apply.ts` — neither of which imports a module for any
 * other reason. `tests/cross-cutting/scenario-fixtures.test.ts` refuses an entry whose name
 * `enabledModules` does not also carry.
 *
 * See: docs/tools/demo-profile.md
 */

import { seedAddressBooksCollection } from './account';
import { seedAuditLogsCollection } from './audit-logs';
import { seedCartsCollection } from './cart';
import { seedLocalesCollection } from './locales';
import { seedOrdersCollection } from './orders';
import { seedProductsCollection, checkProductGuarantees } from './products';
import { seedUsersCollection } from './users';
import { seedWebhooksCollection } from './webhooks';
import { seedWishlistsCollection } from './wishlist';
import type { SeedOutcome } from '@infrastructure/persistence/seed';

/** One module's demo registration: how to seed it. */
export interface DemoModule {
    /** Write this module's slice of the demo dataset. Called only by `scenarios/apply.ts`. */
    seed: () => Promise<SeedOutcome[]>;

    /**
     * Which of this module's `scenario.shop` guarantees (its own `module.ts`) the currently
     * seeded database actually satisfies. Absent for a module that declares none —
     * `scenarios/check.ts` only calls this for a module whose manifest lists something.
     */
    checkGuarantees?: () => Promise<string[]>;
}

/** Every module with demo fixtures. */
export const demoModules: Readonly<Record<string, DemoModule>> = {
    account: {
        seed: seedAddressBooksCollection
    },
    'audit-logs': {
        seed: seedAuditLogsCollection
    },
    cart: {
        seed: seedCartsCollection
    },
    locales: {
        seed: seedLocalesCollection
    },
    orders: {
        seed: seedOrdersCollection
    },
    products: {
        seed: seedProductsCollection,
        checkGuarantees: checkProductGuarantees
    },
    users: {
        seed: seedUsersCollection
    },
    webhooks: {
        seed: seedWebhooksCollection
    },
    wishlist: {
        seed: seedWishlistsCollection
    }
};

/**
 * Seed every module — `scenarios/apply.ts` calls this instead of its own
 * `Promise.all(Object.values(demoModules).map(...))`, so the ordering fix lives in exactly one
 * place.
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
