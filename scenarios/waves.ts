/**
 * @module
 * Generic dependency-wave ordering for a named set of async steps — how `scenarios/shop-modules.ts`
 * seeds `products` after `locales` without a hand-written "this one goes first" special case that
 * has to be edited every time a dependency appears or its target goes away. A name in `after` that
 * is not itself a key of the set is simply not there to wait for — the property that lets a
 * dependency survive its target's deletion (deleting `locales` needs no edit to `products`' entry).
 */

/** One named step: what it does, and which other steps of the SAME set must settle first. */
export interface WaveEntry<T> {
    run: () => Promise<T>;
    /** Names from the same set this step waits for. A name the set does not carry is ignored. */
    after?: readonly string[];
}

/**
 * Group `entries` into waves: everything in one wave can start together, because nothing in it
 * depends on anything else still outstanding; each wave waits for every earlier one to settle.
 *
 * @param entries - name → step, each naming the OTHER entries it needs first
 * @returns entry names, grouped into waves, in the order the waves must run
 * @throws {Error} when `after` forms a cycle nothing in the set could ever resolve
 */
export const waveOrder = <T>(entries: Readonly<Record<string, WaveEntry<T>>>): string[][] => {
    const remaining = new Set(Object.keys(entries));
    const waves: string[][] = [];

    while (remaining.size > 0) {
        // Ready: every dependency it names is either already done (no longer `remaining`) or was
        // never one of `entries`' own keys to begin with — the latter is what makes a dangling
        // `after` inert instead of a crash.
        const ready = [...remaining].filter((name) =>
            (entries[name].after ?? []).every((dependency) => !remaining.has(dependency))
        );

        if (ready.length === 0)
            throw new Error(`scenario wave order: a cycle involves ${[...remaining].join(', ')}`);

        for (const name of ready) remaining.delete(name);
        waves.push(ready);
    }

    return waves;
};

/**
 * Run every entry's step in the fewest sequential waves {@link waveOrder} finds — concurrently
 * within a wave, sequentially across waves — and flatten every step's own result together.
 *
 * A plain loop over each wave, not a `.reduce()`: several sequential awaits (one per wave) read
 * more clearly as `async`/`await` than as a chain threading an accumulator through `.then()`.
 *
 * @param entries - name → step, see {@link waveOrder}
 * @returns every step's result, in wave order (not necessarily ordered within a wave)
 */
export const runInWaves = async <T>(
    entries: Readonly<Record<string, WaveEntry<T>>>
): Promise<T[]> => {
    const results: T[] = [];
    for (const wave of waveOrder(entries))
        results.push(...(await Promise.all(wave.map((name) => entries[name].run()))));

    return results;
};
