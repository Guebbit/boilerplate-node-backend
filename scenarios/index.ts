/**
 * @module
 * The scenario registry: every named, whole-database state this repo knows how to seed, plus the
 * `shop` scenario's own table of per-module fixtures. Every file in this folder imports its
 * module's repository, model and factories directly (never the other way), so a production image
 * can omit this whole folder and nothing under `src/` notices.
 *
 * Walked by `app/demo.ts` and `scenarios/apply.ts` — neither of which imports a module for any
 * other reason. `./check.ts` holds a compile-time twin of the module registry, refusing a
 * `shopModules` entry whose name `enabledModules` does not also carry — this file cannot check
 * that itself, since only `apply.ts`/`run-server.ts`/`check.ts` may reach `src/modules.ts`
 * (`eslint.config.ts`'s boundaries).
 *
 * See: docs/tools/demo-profile.md
 */

import type { Express } from 'express';
import { seedAddressBooksCollection } from './addresses';
import { seedLocalesCollection } from './locales';
import { seedProductsCollection } from './products';
import { seedUsersCollection } from './users';
import { seedWebhooksCollection } from './webhooks';
import { seedWishlistsCollection } from './wishlist';
import { seedBlank } from './blank';
import { seedAccessModel } from './accounts';
import { SHOP_SUBJECTS } from './subjects';
import { withLoopbackServer } from './flows/loopback';
import { driveShopHistory, type ShopHistory } from './flows/shop-history';
import { backdateHistory } from './flows/backdate';
import type { SeedOutcome } from '@scenarios/seed';

/**
 * Every module with `shop` fixtures — the rows that exist BEFORE anybody uses the shop.
 *
 * Orders, payments, shipments, stock movements, reservations, carts and audit entries are
 * deliberately absent: those are what using the shop PRODUCES, and `./flows/shop-history.ts`
 * produces them by using it. See: docs/tools/demo-profile.md#how-a-scenario-is-built
 *
 * No type annotation, deliberately: one would widen every key to `string`, and `./check.ts`'s
 * compile-time check reads the literal keys straight off `keyof typeof shopModules`.
 */
export const shopModules = {
    addresses: {
        seed: seedAddressBooksCollection
    },
    locales: {
        seed: seedLocalesCollection
    },
    products: {
        seed: seedProductsCollection
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
 * The `shop` scenario's STARTING rows: the access model, then every `shopModules` entry.
 *
 * `locales` MUST finish first, not join the concurrent batch: `products.seed()` writes its rows'
 * `translations` through `planTranslations`/`writeTranslations`, and `planSlot`
 * (`@modules/locales/services/translations.ts`) requires every locale in that write — including
 * the fallback locale itself — to already exist as an ACTIVE row. A `Promise.all` over every
 * module would race `products` against `locales` writing that row, and lose it as often as not.
 * No other module reads another module's write, which is what keeps the rest of the table
 * concurrent. Nothing can resolve a caller until there is a shop to be a member of, which is why
 * the access model runs before either.
 *
 * A shop seeded and never driven has an empty catalogue shelf — every product starts at
 * `onHand: 0` and takes delivery from {@link buildScenario}'s flow run.
 */
const seedShop = (): Promise<SeedOutcome[]> =>
    seedAccessModel().then(() =>
        shopModules.locales.seed().then((localeOutcomes) =>
            Promise.all(
                Object.entries(shopModules)
                    .filter(([name]) => name !== 'locales')
                    .map(([, scenarioModule]) => scenarioModule.seed())
            ).then((restOutcomes) => [localeOutcomes, ...restOutcomes].flat())
        )
    );

/** One named, whole-database state: the rows it starts from, and the history it then lives. */
interface Scenario {
    /** Write the starting rows. Assumes an empty database — the caller owns emptying it. */
    seed: () => Promise<SeedOutcome[]>;

    /**
     * Drive the application until the shop has a past, against a base URL that is already
     * listening. Absent for a scenario with nothing to live through.
     */
    drive?: (baseUrl: string) => Promise<ShopHistory>;

    /** Guarantee name → row id, for the rows {@link Scenario.seed} pinned rather than produced. */
    subjects: Readonly<Record<string, string>>;
}

/**
 * The named, whole-database scenarios this repo can seed. `scenarios/apply.ts` and
 * `src/app/demo.ts` both index this instead of a hand-rolled ternary, so a new scenario is added
 * in exactly one place.
 */
export const SCENARIOS = {
    shop: { seed: seedShop, drive: driveShopHistory, subjects: SHOP_SUBJECTS },
    blank: { seed: seedBlank, subjects: {} }
} satisfies Record<string, Scenario>;

/** A name {@link SCENARIOS} actually knows how to seed. */
export type ScenarioName = keyof typeof SCENARIOS;

/**
 * The scenario every caller falls back to when none was named — the shop, since a demo of an
 * ecommerce boilerplate with no catalogue in it demonstrates nothing.
 */
export const DEFAULT_SCENARIO: ScenarioName = 'shop';

/**
 * Whether `name` is one {@link SCENARIOS} carries, narrowing it to {@link ScenarioName}.
 *
 * The registry owns this rather than each caller repeating `Object.hasOwn` and then casting: a
 * bare `Object.hasOwn` narrows the TABLE, never the string handed in, so every caller that skipped
 * this needed an `as ScenarioName` to say what it had already proved. Stated once, as a type
 * guard, the callers need no cast at all.
 *
 * @param name - an unvalidated scenario name, from argv or a request body
 */
export const isScenarioName = (name: string): name is ScenarioName =>
    Object.hasOwn(SCENARIOS, name);

/**
 * Seed a scenario into the CURRENTLY EMPTY database and, where it has one, live its history:
 * drive the real flows against a throwaway loopback listener, then move each order into the past.
 *
 * One function rather than three exported steps because the three have exactly one legitimate
 * order, and it is not obvious: nothing can be driven before the rows exist, and nothing can be
 * backdated before it has been driven.
 *
 * @param name - which scenario
 * @param app - the Express application, for the loopback listener the flows are driven against.
 *              Optional: a scenario with no history to live needs no app at all, which is what
 *              lets `blank` be built by a caller that has not assembled one
 * @returns every subject the scenario offers — its pinned ids merged with the flow-produced ones
 * @throws {Error} when the scenario has flows to drive and no app was given
 */
export const buildScenario = (
    name: ScenarioName,
    app?: Express
): Promise<Readonly<Record<string, string>>> => {
    const { seed, drive, subjects }: Scenario = SCENARIOS[name];

    if (drive && !app)
        throw new Error(`scenario "${name}" lives its history over HTTP and needs the Express app`);

    return seed()
        .then(() => (drive && app ? withLoopbackServer(app, drive) : undefined))
        .then((history) =>
            history
                ? backdateHistory(history.ages).then(() => ({ ...subjects, ...history.subjects }))
                : subjects
        );
};
