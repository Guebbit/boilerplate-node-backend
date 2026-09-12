/**
 * @module
 * The scenario registry: every named, whole-database state this repo knows how to seed, plus the
 * `shop` scenario's own table of per-module fixtures. Every file in this folder imports its
 * module's repository, model and factories directly (never the other way), so a production image
 * can omit this whole folder and nothing under `src/` notices.
 *
 * Walked by `app/demo.ts` and `scenarios/apply.ts` — neither of which imports a module for any
 * other reason. `tests/cross-cutting/scenario-fixtures.test.ts` refuses a `shopModules` entry
 * whose name `enabledModules` does not also carry.
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
import { seedBlank } from './blank';
import { seedAccessModel } from './accounts';
import type { SeedOutcome } from '@scenarios/seed';

/** One module's `shop` registration: how to seed it. */
export interface ScenarioModule {
    /** Write this module's slice of the `shop` scenario. Called only by {@link seedShop}. */
    seed: () => Promise<SeedOutcome[]>;

    /**
     * Which of this module's `scenario.shop` guarantees (its own `module.ts`) the currently
     * seeded database actually satisfies. Absent for a module that declares none —
     * `scenarios/check.ts` only calls this for a module whose manifest lists something.
     */
    checkGuarantees?: () => Promise<string[]>;
}

/** Every module with `shop` fixtures. */
export const shopModules: Readonly<Record<string, ScenarioModule>> = {
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
 * The `shop` scenario: the access model, then every `shopModules` entry's records.
 *
 * `locales` MUST finish first, not join the concurrent batch: `products.seed()` writes its rows'
 * `translations` through `planTranslations`/`writeTranslations`, and `planSlot`
 * (`@modules/locales/services/translations.ts`) requires every locale in that write — including
 * the fallback locale itself — to already exist as an ACTIVE row. A `Promise.all` over every
 * module would race `products` against `locales` writing that row, and lose it as often as not.
 * No other module reads another module's write, which is what keeps the rest of the table
 * concurrent. Nothing can resolve a caller until there is a shop to be a member of, which is why
 * the access model runs before either.
 */
export const seedShop = (): Promise<SeedOutcome[]> =>
    seedAccessModel().then(() =>
        shopModules.locales.seed().then((localeOutcomes) =>
            Promise.all(
                Object.entries(shopModules)
                    .filter(([name]) => name !== 'locales')
                    .map(([, scenarioModule]) => scenarioModule.seed())
            ).then((restOutcomes) => [localeOutcomes, ...restOutcomes].flat())
        )
    );

/**
 * The named, whole-database scenarios this repo can seed. `scenarios/apply.ts` and
 * `src/app/demo.ts` both index this instead of a hand-rolled ternary, so a new scenario is added
 * in exactly one place.
 */
export const SCENARIOS = {
    shop: seedShop,
    blank: seedBlank
} satisfies Record<string, () => Promise<SeedOutcome[]>>;

/** A name {@link SCENARIOS} actually knows how to seed. */
export type ScenarioName = keyof typeof SCENARIOS;
