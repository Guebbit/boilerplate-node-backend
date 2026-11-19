/**
 * @module
 * The test layers, keyed by the name `npm run test:*` passes: which jest path patterns each owns,
 * and whether its files may run side by side.
 *
 * Its own file so the layer runner and the staged-tests step read one list:
 * `run-suite.ts` runs on import, so it cannot be imported for its table.
 *
 * @see docs/build/weak-machines.md#start-here-—-the-two-mechanisms
 */

/**
 * One test layer: the jest path patterns it matches, and whether its files may run side by side.
 *
 * `serialized` is a property of the layer, not the machine: these suites share one in-memory
 * mongod, so their files cannot run side by side regardless of how much memory is free.
 */
export type Suite =
    | {
          /** Path patterns handed to jest, in the same form each npm script passes them. */
          readonly patterns: readonly string[];
          /** One file at a time inside a shard: these suites share one in-memory mongod. */
          readonly serialized: true;
      }
    | {
          readonly patterns: readonly string[];
          readonly serialized: false;
          /**
           * Measured peak cost of one parallel worker, MB — meaningless once `serialized`, so
           *  the type only carries it for a layer that actually runs workers.
           */
          readonly workerPeakMb: number;
      };

/**
 * The layers this runner knows, keyed by the name its npm script passes.
 *
 * `unit` and `cross-cutting` run in parallel; only their worker count comes from this file.
 * Exported so a `package.json` script needing several layers unsharded (the JSON
 * report, randomized order) can name them instead of hand-copying their jest patterns.
 */
export const SUITES: Record<string, Suite> = {
    unit: {
        patterns: ['tests/unit', 'src/modules/.*/tests/unit'],
        serialized: false,
        workerPeakMb: 905
    },
    'cross-cutting': {
        patterns: ['tests/cross-cutting'],
        serialized: false,
        workerPeakMb: 905
    },
    integration: {
        patterns: ['tests/integration', 'src/modules/.*/tests/integration'],
        serialized: true
    },
    contract: {
        patterns: ['tests/contract', 'src/modules/.*/tests/contract'],
        serialized: true
    },
    fuzz: {
        patterns: ['tests/fuzz', 'src/modules/.*/tests/fuzz'],
        serialized: true
    }
};

/**
 * The layers `complete:light:gates` runs in full on every commit.
 * Every other layer's file only runs at commit time when it is staged — see {@link isOutsideLightGate}.
 */
const LIGHT_SUITES = ['unit', 'cross-cutting'] as const;

/**
 * Whether a repo-relative path is a jest test file the light gate does NOT already run.
 * The pre-commit hook runs such a file by itself when the commit adds or changes it.
 *
 * @param path a repo-relative path, as `git diff --name-only` prints it
 * @returns true for a `.test.ts` file under a `tests/` folder outside every light layer
 */
export const isOutsideLightGate = (path: string): boolean =>
    /(?:^|\/)tests\/.*\.test\.ts$/.test(path) &&
    LIGHT_SUITES.every((name) =>
        SUITES[name].patterns.every((pattern) => !new RegExp(pattern).test(path))
    );
