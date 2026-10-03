/**
 * `scenarios/waves.ts` — the generic `after`-graph scheduler `scenarios/shop-modules.ts` seeds
 * `products` after `locales` through. No database: this is a pure ordering function over
 * hand-made entries, the same reason `check.test.ts` feeds `check.ts` a hand-made subject map.
 */

import { runInWaves, waveOrder, type WaveEntry } from '@scenarios/waves';

/** An entry whose `run` records when it actually ran, into a shared log both sides can read. */
const recording = (log: string[], name: string, after?: readonly string[]): WaveEntry<string> => ({
    run: () => {
        log.push(name);
        return Promise.resolve(name);
    },
    after
});

describe('waveOrder', () => {
    it('puts an entry with no dependencies in the first wave', () => {
        const entries = { a: recording([], 'a') };

        expect(waveOrder(entries)).toEqual([['a']]);
    });

    it('waits a dependent entry for the wave its dependency settles in', () => {
        const entries = {
            locales: recording([], 'locales'),
            products: recording([], 'products', ['locales'])
        };

        expect(waveOrder(entries)).toEqual([['locales'], ['products']]);
    });

    it('runs independent entries in the same wave', () => {
        const entries = {
            addresses: recording([], 'addresses'),
            wishlist: recording([], 'wishlist')
        };

        expect(waveOrder(entries)).toEqual([['addresses', 'wishlist']]);
    });

    // The property that matters here: deleting `locales`' own entry must
    // not require editing `products`' — a dependency on a name that is simply not in the table
    // is satisfied for free, not a broken reference.
    it('ignores an `after` name absent from the table', () => {
        const entries = { products: recording([], 'products', ['locales']) };

        expect(waveOrder(entries)).toEqual([['products']]);
    });

    it('throws naming every entry stuck in a cycle', () => {
        const entries = {
            a: recording([], 'a', ['b']),
            b: recording([], 'b', ['a'])
        };

        expect(() => waveOrder(entries)).toThrow(/a, b|b, a/);
    });
});

describe('runInWaves', () => {
    it('runs a later wave only once the earlier one has settled', async () => {
        const log: string[] = [];
        const entries = {
            locales: recording(log, 'locales'),
            products: recording(log, 'products', ['locales'])
        };

        await runInWaves(entries);

        expect(log).toEqual(['locales', 'products']);
    });

    it('flattens every wave’s results together, in wave order', async () => {
        const entries = {
            locales: recording([], 'locales'),
            products: recording([], 'products', ['locales'])
        };

        await expect(runInWaves(entries)).resolves.toEqual(['locales', 'products']);
    });
});
