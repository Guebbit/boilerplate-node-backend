/**
 * The context map, asserted against the code it describes.
 *
 * `dependsOn` in each manifest is not a dependency list — it is a labelled graph, where every edge
 * says which sibling is reached and what kind of relationship that is. A label nobody checks is a
 * comment with extra syntax, so this file holds it to three things:
 *
 *   1. **The edge is real.** A declared dependency that nothing imports is a claim about coupling
 *      that has already been undone. `payments → users` was exactly that before this test existed.
 *   2. **The edge is declared.** The reverse: an import across a module boundary that no edge
 *      names. ESLint stops a module reaching a sibling's internals; nothing until now stopped it
 *      reaching a sibling it never admitted to needing.
 *   3. **`shared-kernel` stays rare.** Two modules writing one model is the most expensive
 *      relationship in the taxonomy, because a change to that model has to be agreed twice. The
 *      allowlist below is short on purpose: adding to it is a deliberate edit with a reviewer
 *      attached, which is the only enforcement a judgement call can have.
 *
 * Imports are read from the source rather than resolved, for the same reason
 * `eslint-plugin-boundaries` does it: the question is what the code SAYS, and a spec that
 * needed the app booted to answer it would be an integration test.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { enabledModules } from '../../src/modules';
import type { AppModule, ContextRelationship } from '@kernel/registry';

const MODULES_ROOT = path.join(__dirname, '../../src/modules');

/**
 * Edges allowed to be `shared-kernel`, as `<from>→<to>`.
 *
 * One entry, and it earns it: `account` and `users` are two services over one User record, which is
 * why the users barrel publishes its model and repository rather than only its service. A second
 * entry should be argued for in review, not added to make a test pass.
 */
const SHARED_KERNEL_ALLOWLIST = new Set(['account→users']);

/** Every `.ts` file below `directory`, recursively. */
const listFiles = (directory: string): string[] =>
    readdirSync(directory).flatMap((entry) => {
        const entryPath = path.join(directory, entry);
        if (statSync(entryPath).isDirectory()) return listFiles(entryPath);
        return entryPath.endsWith('.ts') ? [entryPath] : [];
    });

/**
 * Which siblings a module's PRODUCTION code imports.
 *
 * Specs are excluded deliberately. A test may reach a sibling's manifest or factories to assert
 * cross-module cleanup, and that is not a dependency of the domain — counting it would make every
 * module look coupled to every module it is tested against.
 */
const importedSiblings = (owner: string): Set<string> => {
    const siblings = new Set<string>();
    for (const file of listFiles(path.join(MODULES_ROOT, owner))) {
        if (file.includes(`${path.sep}tests${path.sep}`)) continue;
        for (const match of readFileSync(file, 'utf8').matchAll(/["']@modules\/([^"'/]+)/g))
            if (match[1] !== owner) siblings.add(match[1]);
    }
    return siblings;
};

/** `<from>→<to>` for every declared edge, with its kind. */
const declaredEdges = (): { from: string; to: string; as: ContextRelationship }[] =>
    enabledModules.flatMap((appModule: AppModule) =>
        (appModule.dependsOn ?? []).map((edge) => ({
            from: appModule.name,
            to: edge.module,
            as: edge.as
        }))
    );

describe('the context map describes the imports that exist', () => {
    it('finds the modules it is meant to check', () => {
        // A canary: an empty sweep must mean "nothing depends on anything", not "the sweep broke".
        // A literal floor would be a copy of `src/modules.ts` written as an integer, which goes
        // stale on the commit that adds a domain rather than on the commit that breaks this file.
        expect(enabledModules.length).toBeGreaterThan(0);
        expect(declaredEdges().length).toBeGreaterThanOrEqual(1);
    });

    it('declares no edge that nothing imports', () => {
        const stale = declaredEdges()
            .filter(({ from, to }) => !importedSiblings(from).has(to))
            .map(({ from, to }) => `${from} declares ${to}, but imports nothing from it`);

        expect(stale).toEqual([]);
    });

    it('imports no sibling that no edge declares', () => {
        const undeclared: string[] = [];

        for (const appModule of enabledModules) {
            const declared = new Set((appModule.dependsOn ?? []).map((edge) => edge.module));
            for (const sibling of importedSiblings(appModule.name))
                if (!declared.has(sibling))
                    undeclared.push(
                        `${appModule.name} imports ${sibling}, but declares no edge to it`
                    );
        }

        expect(undeclared).toEqual([]);
    });

    it('keeps shared kernels to the ones that have been argued for', () => {
        const kernels = declaredEdges()
            .filter(({ as }) => as === 'shared-kernel')
            .map(({ from, to }) => `${from}→${to}`)
            .filter((edge) => !SHARED_KERNEL_ALLOWLIST.has(edge));

        expect(kernels).toEqual([]);
    });
});
