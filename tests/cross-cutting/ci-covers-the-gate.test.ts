import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Guard: every check `npm run complete` runs has a CI job behind it.
 *
 * "What must pass" is defined twice — once as the `complete` chain the pre-commit hook runs, once
 * as the job list in `.github/workflows/`. Two definitions of one rule drift, and this one drifted
 * in the direction that matters: five checks reached the local gate and no workflow, so a
 * contributor using `--no-verify`, cloning without husky, or opening a PR from a fork bypassed them
 * with CI still green. `ci.yml` already builds a commitlint job described as a *"backstop for
 * commits made with --no-verify or on a machine where the Husky hook never installed"* — the bypass
 * is known, and this asserts the backstop is complete.
 *
 * Compared after EXPANDING both sides: `complete` is a chain of `npm run` calls, several of which
 * are chains themselves, so comparing the names as written would call `complete` covered because
 * CI happens to mention one of its members.
 *
 * One-directional on purpose. CI running more than the gate is correct — `fuzz.yml` and
 * `mutation.yml` are nightly and deliberately absent from `complete`.
 */

const ROOT = path.join(__dirname, '..', '..');

const packageScripts = (): Record<string, string> =>
    (
        JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
            scripts: Record<string, string>;
        }
    ).scripts;

/**
 * Expand a script to the script NAMES it ultimately runs.
 *
 * A member that is itself an `npm run` chain expands in turn, so `complete` becomes the seventeen
 * checks it is made of rather than the one name it is called by. A member that is a real command
 * (`jest …`, `tsc --noEmit`) is a leaf and contributes nothing to compare by name.
 */
const expand = (
    script: string,
    all: Record<string, string>,
    seen = new Set<string>()
): string[] => {
    if (seen.has(script)) return [];
    seen.add(script);

    return (all[script] ?? '').split('&&').flatMap((step) => {
        const named = /^npm run ([\w:-]+)/.exec(step.trim());
        if (!named) return [];
        const child = named[1];
        const grandchildren = expand(child, all, seen);
        // A script that runs no other script is itself the unit CI has to name.
        return grandchildren.length > 0 ? grandchildren : [child];
    });
};

/** Every script name any workflow invokes, plus everything those names expand to. */
const scriptsRunByCi = (all: Record<string, string>): Set<string> => {
    const workflows = path.join(ROOT, '.github', 'workflows');
    const named = readdirSync(workflows)
        .filter((file) => file.endsWith('.yml'))
        .flatMap((file) =>
            readFileSync(path.join(workflows, file), 'utf8')
                .split('\n')
                // `ci.yml`'s header explains why there is no `npm run complete` job. A comment is
                // not a job, and reading one as coverage is how this check would pass while the
                // gap it exists for stayed open.
                .filter((line) => !line.trim().startsWith('#'))
                .flatMap((line) => [...line.matchAll(/npm run ([\w:-]+)/g)].map(([, name]) => name))
        );

    return new Set(named.flatMap((name) => [name, ...expand(name, all)]));
};

/**
 * Gate members CI covers under a different name, each with the reason.
 *
 * An exception list, which this repo avoids — but the alternative is comparing the arguments of two
 * jest invocations and calling that semantic equality. An entry here has to be argued in a diff,
 * which is the property that matters.
 */
const COVERED_UNDER_ANOTHER_NAME: Record<string, string> = {
    // `test-unit` runs `test:unit:coverage`, whose jest invocation takes `tests/cross-cutting` as
    // an argument alongside `tests/unit`. Same suite, different spelling.
    'test:cross-cutting': 'test:unit:coverage'
};

describe('CI runs every check the local gate does', () => {
    it('leaves no member of `complete` without a job', () => {
        const all = packageScripts();
        const covered = scriptsRunByCi(all);

        const uncovered = expand('complete', all).filter(
            (member) =>
                !covered.has(member) &&
                !(
                    member in COVERED_UNDER_ANOTHER_NAME &&
                    covered.has(COVERED_UNDER_ANOTHER_NAME[member])
                )
        );

        expect(uncovered).toEqual([]);
    });

    it('actually reads both sides', () => {
        // A canary: an empty result must mean "all covered", never "the file moved".
        const all = packageScripts();
        expect(expand('complete', all).length).toBeGreaterThan(10);
        expect(scriptsRunByCi(all).size).toBeGreaterThan(5);
    });
});
