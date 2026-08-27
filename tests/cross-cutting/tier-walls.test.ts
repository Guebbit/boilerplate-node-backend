/**
 * The tier walls, asserted a second time and on purpose.
 *
 * `eslint-plugin-boundaries` already refuses these edges and `check:dependencies` re-checks them
 * transitively. This file is not a spare copy of either. The three tools see different things and
 * fail differently:
 *
 * - The plugins and dependency-cruiser read the dependency GRAPH. They are the authority, they
 *   understand the whole ruleset — `no-unknown-files` refuses a file no descriptor claims,
 *   `default: 'disallow'` refuses an edge no policy claims — and they report a violation as an
 *   arrow between two elements.
 * - These read the source TEXT. That catches what a graph cannot: a tier named in a container key,
 *   in a config value, in a specifier assembled for a dynamic `import()`. Every one of those tools
 *   parses import syntax, so a crossing that is not an import declaration is invisible to all of
 *   them.
 *
 * The second reason is plainer: this suite runs in `npm test`, which is what a contributor runs. A
 * wall that only breaks in a separate tool is a wall people learn about in review.
 *
 * ── What counts as naming a tier ──────────────────────────────────────────────────────────────
 * Two spellings, because a crossing has exactly two forms here. The path alias (`@modules/…`) is
 * how every cross-tier import in `src/` is written — there is not one `../../` between tiers in the
 * tree — and the repo-relative path (`src/modules/…`) is what a string reaches for when it is not
 * an import at all. Matching one and not the other would find the edge the linter already refuses
 * and miss the one it cannot see, which is precisely backwards.
 *
 * ── What is exempt, and why ───────────────────────────────────────────────────────────────────
 * Comment lines are skipped. A `@see @modules/orders` in a kernel docblock is a pointer a READER
 * follows: it compiles to nothing, and forbidding it would mean the kernel cannot explain itself
 * with an example. A specifier in a config array is the opposite — nothing reads it but the
 * loader, and deleting the module it names breaks the boot.
 *
 * A module's co-located specs are exempt for the reason the boundaries config gives them their own
 * `spec` category: a spec is deleted with the module it belongs to, so it cannot leave coupling
 * behind that outlives either one.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const SRC_ROOT = path.join(__dirname, '../../src');

/** Every `.ts` file under a tier, minus the co-located specs. */
const filesUnder = (root: string): string[] =>
    readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(root, entry.name);
        if (entry.isDirectory()) return entry.name === 'tests' ? [] : filesUnder(full);
        return entry.isFile() && full.endsWith('.ts') ? [full] : [];
    });

/**
 * Whether a line is nothing but a comment.
 *
 * Deliberately conservative: it recognises a line that STARTS as a comment, not a trailing one.
 * `const target = '@modules/orders'; // the catalogue` is code with a note attached, and the code
 * half is what this suite is looking at.
 */
const isCommentLine = (line: string): boolean => /^\s*(?:$|\/\/|\/\*|\*|#)/.test(line);

/** Both spellings a tier is named by — the import alias and the repo-relative path. */
const spellings = (tier: string): string[] => [`@${tier}/`, `src/${tier}/`];

/** Every `path:line` under `tier` whose CODE names one of `forbidden`. */
const crossings = (tier: string, forbidden: string[]): string[] => {
    const needles = forbidden.flatMap((name) => spellings(name));

    return filesUnder(path.join(SRC_ROOT, tier))
        .flatMap((file) =>
            readFileSync(file, 'utf8')
                .split('\n')
                .map((line, index) => ({ line, number: index + 1 }))
                .filter(({ line }) => !isCommentLine(line))
                .filter(({ line }) => needles.some((needle) => line.includes(needle)))
                .map(
                    ({ line, number }) =>
                        `${path.relative(SRC_ROOT, file)}:${number} → ${line.trim()}`
                )
        )
        .toSorted();
};

describe('the tier walls, read as text', () => {
    it('finds the source it means to sweep', () => {
        /*
         * The canary. Every case below asserts an EMPTY list, so a moved root, a renamed tier or a
         * broken walk turns the whole file green while reading nothing — the one failure mode a
         * suite of negative assertions cannot report on itself.
         */
        expect(filesUnder(path.join(SRC_ROOT, 'infrastructure')).length).toBeGreaterThan(30);
        expect(filesUnder(path.join(SRC_ROOT, 'kernel')).length).toBeGreaterThan(3);
        expect(filesUnder(path.join(SRC_ROOT, 'modules')).length).toBeGreaterThan(100);
    });

    it('keeps infrastructure below everything else', () => {
        // The bottom of the stack. The test for what belongs here: would this file still make
        // sense in an application with no modules at all?
        expect(crossings('infrastructure', ['kernel', 'modules', 'app'])).toEqual([]);
    });

    it('keeps the kernel from naming a single module', () => {
        // The kernel IS the module system: the registry, the bus between modules, the auth port.
        // It knows that modules exist and never which ones. One reference to a named module would
        // make the mechanism depend on a thing it exists to carry.
        expect(crossings('kernel', ['modules', 'app'])).toEqual([]);
    });

    it('keeps modules from reaching the application tier', () => {
        // `app` assembles the application and is allowed to know every domain. Reaching back would
        // point the arrow both ways. A guard every module needs belongs in the kernel behind a
        // port — see `kernel/authentication.ts`.
        expect(crossings('modules', ['app'])).toEqual([]);
    });
});
