/**
 * @module
 * The `shop` scenario's per-module fixture table — kept apart from `scenarios/index.ts` so
 * `blank.ts` can read it too, without the two files importing each other: `index.ts` builds
 * `blank` and `shop` alike from these entries, so a value both need cannot live inside either.
 *
 * See: docs/tools/demo-profile.md
 */

import type { SeedOutcome } from '@scenarios/seed';
import type { WaveEntry } from './waves';
import type { Caller } from './flows/client';
import { shopModuleFixtures } from './shop-modules.generated';

/** One `shopModules` entry: its fixtures, what it waits for, and whether `blank` also wants it. */
export interface ShopModuleEntry {
    seed: () => Promise<SeedOutcome[]>;
    /**
     * Other `shopModules` entries this one's write depends on — see `./waves`'s `WaveEntry` for
     * what a name absent from the table means: it is ignored, so an entry survives the deletion
     * of the one it waited for.
     */
    after?: readonly string[];
    /**
     * Also seeded by `blank` — the harness-only scenario that exists before there is a shop.
     * `locales` is the one entry today: a spec that creates its own product still needs the
     * fallback language active. `users` is NOT baseline — `blank` seeds four NAMED accounts
     * (`./users`'s `seedNamedUsersCollection`), not the full demo set this entry's `seed` writes.
     */
    baseline?: boolean;
    /**
     * A demo-history step this entry contributes, driven by whatever scenario calls
     * `Scenario.drive` (`./index.ts`) — the module that owns a piece of the story owns writing
     * it, rather than the flow hardcoding a call into a route that stops existing the day this
     * entry does.
     */
    driveHistoryEdit?: (owner: Caller) => Promise<void>;
}

/**
 * Every module with `shop` fixtures — the rows that exist BEFORE anybody uses the shop.
 *
 * Collected from the `shopModule` export of each `scenarios/<module>.ts` (`./shop-modules.generated`),
 * not listed here: a module's entry is added or removed by adding or deleting its file.
 * Orders, payments, shipments, stock movements, reservations, carts and audit entries are
 * deliberately absent: those are what using the shop PRODUCES, once something drives it. See:
 * docs/tools/demo-profile.md#how-a-scenario-is-built
 *
 * `satisfies`, not an annotation: an annotation would widen every key to `string`, and
 * `./check.ts`'s compile-time check reads the literal keys straight off `keyof typeof shopModules`.
 */
export const shopModules = shopModuleFixtures satisfies Record<string, ShopModuleEntry>;

/**
 * Reshape a `shopModules`-like table into what `./waves`'s `runInWaves`/`waveOrder` take —
 * `WaveEntry`'s `run` is this table's `seed`, under the name every scheduling decision is made in
 * terms of.
 * @param entries - a `shopModules` table, or a subset of one (see {@link baselineShopModules})
 */
export const asWaveEntries = (
    entries: Readonly<Record<string, ShopModuleEntry>>
): Record<string, WaveEntry<SeedOutcome[]>> =>
    Object.fromEntries(
        Object.entries(entries).map(([name, entry]) => [
            name,
            { run: entry.seed, after: entry.after }
        ])
    );

/**
 * Every history step a `shopModules` entry contributes, in table order — what a scenario's drive
 * runs, so a deleted module drops its step by dropping its entry.
 */
export const historyEdits = (): ((owner: Caller) => Promise<void>)[] => {
    // Widened to the common entry shape for the same reason as in {@link baselineShopModules}.
    const entries: Record<string, ShopModuleEntry> = shopModules;

    return Object.values(entries).flatMap((entry) =>
        entry.driveHistoryEdit ? [entry.driveHistoryEdit] : []
    );
};

/**
 * `shopModules`, narrowed to the entries `blank` also seeds — `blank.ts` runs this (via
 * {@link asWaveEntries}) alongside its own blank-specific fixtures (the named accounts) rather
 * than duplicating a second copy of whichever entries happen to be baseline today.
 */
export const baselineShopModules = (): Record<string, ShopModuleEntry> => {
    // `shopModules`' own type is the union of each entry's OWN literal shape (`satisfies` keeps
    // it that way on purpose, for `check.ts`'s `keyof typeof shopModules`) — widening it to the
    // common `ShopModuleEntry` shape here is exactly what a table of otherwise-differently-shaped
    // entries needs before it can be filtered by a field not every entry's literal type carries.
    const entries: Record<string, ShopModuleEntry> = shopModules;

    return Object.fromEntries(Object.entries(entries).filter(([, entry]) => entry.baseline));
};
