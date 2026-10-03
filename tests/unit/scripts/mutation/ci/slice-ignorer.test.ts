/**
 * `scripts/mutation/ci/slice-ignorer.ts` — the Stryker ignorer that narrows a run to a line slice.
 *
 * A real Stryker run proved the whole-file result equals the merged slices (2026-09-30); these pin
 * the two decisions that proof rests on: "touching" keeps a node in, and no slice means no-op.
 */
import type { IgnorerPath } from '../../../../../scripts/mutation/ci/slice-ignorer';
import { setProcessEnvironment } from '@tests/environment';
import {
    SLICE_IGNORE_REASON,
    outsideSlice,
    parseSlice
} from '../../../../../scripts/mutation/ci/slice-ignorer';

/** A node spanning `start`..`end` (1-based lines). */
const node = (start: number, end: number) => ({ start: { line: start }, end: { line: end } });

/**
 * The plugin's `shouldIgnore`, from a fresh copy of the module loaded with `MUTATION_SLICE` set to
 * `slice` — the module reads it once, at load.
 */
const pluginWith = async (
    slice: string | undefined
): Promise<(path: IgnorerPath) => string | undefined> => {
    setProcessEnvironment({ MUTATION_SLICE: slice });

    let shouldIgnore: ((path: IgnorerPath) => string | undefined) | undefined;
    await jest.isolateModulesAsync(async () => {
        const { strykerPlugins } = await import('../../../../../scripts/mutation/ci/slice-ignorer');
        shouldIgnore = strykerPlugins[0].value.shouldIgnore;
    });

    // Assigned inside the callback above, which `isolateModulesAsync` has awaited by now.
    return shouldIgnore!;
};

describe('parseSlice', () => {
    it('reads no slice from an unset or empty variable', () => {
        expect(parseSlice(undefined)).toBeUndefined();
        expect(parseSlice('')).toBeUndefined();
    });

    it('reads an inclusive range', () => {
        expect(parseSlice('120-240')).toEqual({ from: 120, to: 240 });
        expect(parseSlice(' 7-7 ')).toEqual({ from: 7, to: 7 });
    });

    it.each(['abc', '12', '0-5', '9-3', '1-2-3'])(
        'refuses %p rather than mutating the whole file',
        (raw) => {
            expect(() => parseSlice(raw)).toThrow(/MUTATION_SLICE/);
        }
    );
});

describe('outsideSlice', () => {
    const slice = { from: 10, to: 20 };

    it('is outside when the node ends before the slice or starts after it', () => {
        expect(outsideSlice(node(1, 9), slice)).toBe(true);
        expect(outsideSlice(node(21, 30), slice)).toBe(true);
    });

    it('stays in when the node touches the slice by a single line', () => {
        expect(outsideSlice(node(1, 10), slice)).toBe(false);
        expect(outsideSlice(node(20, 30), slice)).toBe(false);
    });

    it('stays in when the node spans the whole slice — the edge node both neighbours test', () => {
        expect(outsideSlice(node(1, 100), slice)).toBe(false);
    });

    it('never ignores a node without a location', () => {
        expect(outsideSlice(undefined, slice)).toBe(false);
        expect(outsideSlice(null, slice)).toBe(false);
    });
});

describe('the ci-slice plugin', () => {
    it('ignores a node outside MUTATION_SLICE, with the reason merge.ts looks for', async () => {
        const shouldIgnore = await pluginWith('10-20');

        expect(shouldIgnore({ node: { loc: node(30, 40) } })).toBe(SLICE_IGNORE_REASON);
        expect(shouldIgnore({ node: { loc: node(15, 16) } })).toBeUndefined();
    });

    it('ignores nothing when MUTATION_SLICE is unset', async () => {
        const shouldIgnore = await pluginWith(undefined);

        expect(shouldIgnore({ node: { loc: node(30, 40) } })).toBeUndefined();
    });
});
