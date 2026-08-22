/**
 * Every coverage floor is attached to code that exists.
 *
 * `jest.config.js` names its own failure mode twice over: a `coverageThreshold` key that matches
 * no file is silently ignored — the run stays green while reading like a gate. That is not
 * hypothetical; it is how three keys detached at once. The single-star infrastructure key
 * stopped matching the files that moved into `runtime/` and `persistence/`, the per-module
 * service-file key stopped matching `account` and `cart` the day they became `services/`
 * directories, and 203 of 275 source files sat under no floor before anyone noticed (fixed
 * 2026-08-19). (The keys are spelled in words here for the reason the config's own header
 * gives: a glob written out in full closes this comment on its wildcard-then-slash.)
 *
 * Jest resolves each threshold key to an absolute path and expands it with `glob.sync`
 * (`@jest/reporters`, CoverageReporter). This test performs the same expansion and fails the key
 * that comes back empty — so the next directory rename turns the run red instead of unmeasured.
 *
 * What this does NOT assert is the converse — that every covered file matches some key. That
 * list has deliberate absences (the controllers, driven by the contract and integration suites;
 * the per-module `routes.ts`/`seeds.ts` tier, awaiting per-module floors), and legislating it
 * is a decision for whoever owns the ratchet, not for a guard test.
 */

import path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the config is CommonJS by design (see its header comment); importing it any other way would copy the list this test exists to check.
const jestConfig = require('../../jest.config.js') as {
    coverageThreshold: Record<string, unknown>;
};

interface GlobModule {
    sync(pattern: string, options: { windowsPathsNoEscape: boolean }): string[];
}

// Not the hoisted `glob` (a v7 transitive with different extglob handling and no types) but the
// very instance the reporter loads — resolved through `@jest/reporters` so the two can never
// disagree about what a key matches.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- see above: fidelity to the reporter is the point.
const { sync: globSync } = require(
    require.resolve('glob', { paths: [require.resolve('@jest/reporters')] })
) as GlobModule;

const ROOT = path.join(__dirname, '../..');

describe('the coverage threshold keys', () => {
    const keys = Object.keys(jestConfig.coverageThreshold).filter((key) => key !== 'global');

    it('exist in more than name, so the assertions below are not vacuous', () => {
        expect(keys.length).toBeGreaterThanOrEqual(10);
    });

    it.each(keys)('"%s" still matches at least one file', (key) => {
        // The same call Jest makes when it applies the key. `windowsPathsNoEscape` mirrors the
        // reporter; on this repo's paths it changes nothing, but the point is identical semantics.
        const matches = globSync(path.resolve(ROOT, key), { windowsPathsNoEscape: true });

        expect(matches).not.toEqual([]);
    });

    it.each(keys)('"%s" matches at least one file the coverage run measures', (key) => {
        // A key whose every match is excluded from `collectCoverageFrom` (test code, `.d.ts`,
        // `src/types/`) is exactly as dead as one matching nothing.
        const measured = globSync(path.resolve(ROOT, key), { windowsPathsNoEscape: true }).filter(
            (file: string) =>
                !file.endsWith('.d.ts') &&
                !file.includes(`${path.sep}tests${path.sep}`) &&
                !file.includes(`${path.sep}src${path.sep}types${path.sep}`)
        );

        expect(measured).not.toEqual([]);
    });
});
