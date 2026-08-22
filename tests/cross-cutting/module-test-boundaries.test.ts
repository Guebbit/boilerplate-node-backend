/**
 * The module boundary, as it applies to co-located specs.
 *
 * Production code under `src/modules` is held to one rule by ESLint: reach a sibling through its
 * public barrel, never its internals. Specs cannot be held to exactly that rule — a unit test of
 * `service.ts` must import `service.ts`, not the barrel's view of it — so ESLint is switched off
 * for a module's `tests` directory and the boundary is asserted here instead.
 *
 * (Globs are spelled in words in this docblock: written literally, the wildcard-then-slash would
 * close the comment.)
 *
 * It lives in a test rather than in the lint config because the rule is RELATIONAL: what a spec
 * may import depends on which module owns it, and `no-restricted-imports` only matches file globs.
 * Expressing it in ESLint would mean one near-identical block per module — nine today, and a new
 * one silently missing the day someone adds a domain. Reaching for `eslint-plugin-import`'s zones
 * would mean a new dependency for a rule this file states in twenty lines.
 *
 * What a spec owned by module X may import:
 *
 *   - anything under `@modules/X/…`            — it is testing its own module
 *   - `@modules/Y`                             — a sibling's public barrel, same as production
 *   - `@modules/Y/module`                      — a sibling's manifest, so `registerModules([...])`
 *                                                can run the real registry
 *   - `@modules/Y/tests/…`                     — a sibling's factories and test helpers
 *
 * Anything else — `@modules/Y/service`, `/repository`, `/metrics`, a controller — is a spec
 * reaching past a boundary that production code is not allowed to cross. That is worth catching
 * for the same reason the production rule exists: it is coupling that outlives the reason for it,
 * and it makes the sibling harder to delete.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const MODULES_ROOT = path.join(__dirname, '../../src/modules');

/** Every `.ts` file below `directory`, recursively. */
const listFiles = (directory: string): string[] =>
    readdirSync(directory).flatMap((entry) => {
        const entryPath = path.join(directory, entry);
        if (statSync(entryPath).isDirectory()) return listFiles(entryPath);
        return entryPath.endsWith('.ts') ? [entryPath] : [];
    });

/** `<owner module> → its spec files`, discovered rather than listed. */
const listModuleSpecs = (): { owner: string; file: string }[] =>
    readdirSync(MODULES_ROOT).flatMap((owner) => {
        const testsRoot = path.join(MODULES_ROOT, owner, 'tests');
        return existsSync(testsRoot) ? listFiles(testsRoot).map((file) => ({ owner, file })) : [];
    });

/** Every `@modules/...` specifier a file imports, however it is written. */
const readModuleImports = (file: string): string[] =>
    [...readFileSync(file, 'utf8').matchAll(/["']@modules\/([^"']+)["']/g)].map(
        (match) => match[1]
    );

describe('co-located specs respect the module boundary', () => {
    it('finds specs in every module that has them', () => {
        // A canary: an empty sweep must mean "no module has specs", not "the sweep broke".
        //
        // Asserted as agreement with the disk rather than as a floor. A literal here is a copy of
        // `src/modules.ts` written as an integer — and the equality is the stronger statement
        // anyway: a module whose `tests/` the walk fails to reach is a module whose specs are
        // unguarded, which a floor of "at least eight" would happily pass over.
        const owners = new Set(listModuleSpecs().map((spec) => spec.owner));
        const withTests = readdirSync(MODULES_ROOT).filter((name) =>
            existsSync(path.join(MODULES_ROOT, name, 'tests'))
        );

        expect(withTests.length).toBeGreaterThan(0);
        expect([...owners].toSorted()).toEqual(withTests.toSorted());
    });

    it('never reaches into a sibling module past its barrel, manifest or tests', () => {
        const violations: string[] = [];

        for (const { owner, file } of listModuleSpecs())
            for (const specifier of readModuleImports(file)) {
                const [target, ...rest] = specifier.split('/');

                // Its own module: anything goes, that is what it is testing.
                if (target === owner) continue;
                // A sibling's public barrel — `@modules/users`.
                if (rest.length === 0) continue;
                // A sibling's manifest, or anything under its tests/.
                if (rest[0] === 'module' || rest[0] === 'tests') continue;

                violations.push(
                    `${path.relative(MODULES_ROOT, file)} imports @modules/${specifier}`
                );
            }

        expect(violations).toEqual([]);
    });
});
