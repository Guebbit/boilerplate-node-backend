/**
 * @module
 * The three claims about the scenario fixtures that nothing else makes.
 *
 * Reads the FIXTURES, not a seeded database — no database at all. Everything else about that data
 * already has a guard, and this file deliberately holds none of it:
 *
 * | Claim                                     | Already enforced by                               |
 * | ------------------------------------------ | ---------------------------------------------------- |
 * | every `scenario.shop` guarantee is seeded | `tests/integration/scenarios/shop.test.ts`         |
 * | a seeded row parses as its response shape | `tests/integration/scenarios/shop.test.ts`         |
 * | `(locale, tenant, key)` is unique          | `localeEntries_locale_tenant_key`, a unique index  |
 * | published credentials match the accounts  | `tests/unit/scenarios/accounts.test.ts`            |
 * | a product has its fallback-locale row      | `planTranslations` refuses to write one without it |
 *
 * Deliberately NOT here: any assertion counting fixtures ("exactly one soft-deleted product", "at
 * least one deeply nested key"). A census records a choice someone made rather than a rule the data
 * has to satisfy — it fails on every legitimate edit, and says nothing when it passes.
 */

import { localeEntryFixtures, localeFixtures } from '@scenarios/locales';
import { shopModules } from '@scenarios/index';
import { enabledModules } from '../../src/modules';

/**
 * Entries name their language by TAG, so the build's dangling-reference sweep cannot see them: it
 * matches keys ending in `Id`. An entry under an unregistered language renders as a dictionary the
 * manifest never lists.
 */
it('gives every seeded locale entry a language the dataset also registers', () => {
    const registered = new Set(localeFixtures.map((language) => language.tag));
    const orphans = localeEntryFixtures
        .filter((entry) => !registered.has(entry.locale))
        .map((entry) => `${entry.locale}: ${entry.key}`);

    expect(orphans).toEqual([]);
});

/**
 * `products.list` beside `products.list.title` cannot be expressed as one tree, and
 * `GET /locales/:locale/messages` THROWS for a language holding the pair. Not a duplicate key, so
 * the unique index does not fire.
 *
 * Grouped by `(locale, tenant)` — the scope `@modules/locales/repository` actually builds a tree
 * over, so two tenants may each hold a key the other prefixes.
 */
it('never lets one locale entry key prefix another in the same tree', () => {
    const trees = new Map<string, string[]>();
    for (const { locale, tenant, key } of localeEntryFixtures) {
        const tree = `${locale}/${tenant ?? ''}`;
        const keys = trees.get(tree) ?? [];
        keys.push(key);
        trees.set(tree, keys);
    }

    const collisions = [...trees].flatMap(([tree, keys]) =>
        keys
            .filter((key) => keys.some((other) => other.startsWith(`${key}.`)))
            .map((key) => `${tree}: ${key} is a prefix of another key`)
    );

    expect(collisions).toEqual([]);
});

/**
 * A module seeding rows the app does not mount writes a collection nothing serves — silent, since
 * `scenarios/apply.ts` only ever walks the table it is given.
 */
it('registers no shop module that `enabledModules` does not also enable', () => {
    const mounted = new Set(enabledModules.map((appModule) => appModule.name));
    const unmounted = Object.keys(shopModules).filter((name) => !mounted.has(name));

    expect(unmounted).toEqual([]);
});
