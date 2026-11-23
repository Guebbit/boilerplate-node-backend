/**
 * @module
 * One shared reader for "which module folders does `demo:remove` take" — by default the
 * `group: shop` ones and the `group: example` one, or the list `--modules a,b,c` names. What
 * `demo-remove.ts` asks, off each module's own `module.yaml` rather than a hand-kept list. A
 * relabelled module changes the script without an edit to it.
 */

import path from 'node:path';
import { parseArgs } from 'node:util';
import { readAllModuleDescriptors } from '../docs/module-descriptor';

/** The `module.yaml` groups `demo:remove` deletes: everything but `foundation`. */
const REMOVABLE_GROUPS: ReadonlySet<string> = new Set(['shop', 'example']);

/**
 * Every module folder under `src/modules/<repoRoot>` labelled `group: shop` or `group: example`. The example module is the template to
 * copy; a deployment that has copied it deletes it, and it is mounted in production (anyone can
 * create a note), so the strip takes it too.
 * @param repoRoot - the checkout root to read `src/modules/` from (a scratch copy, or the real one)
 *
 * @see docs/understand/strategic-ddd.md#4a-foundation-and-shop
 */
export const readDemoModuleNames = (repoRoot: string): string[] => {
    const modulesRoot = path.join(repoRoot, 'src', 'modules');
    return Object.entries(readAllModuleDescriptors(modulesRoot))
        .filter(([, descriptor]) => REMOVABLE_GROUPS.has(descriptor.group))
        .map(([name]) => name);
};

/**
 * The modules a strip takes: the `--modules` list when the command line has one, else every demo
 * module. A named list is taken as written, so `example` goes only when it is on the list.
 *
 * @param repoRoot - the checkout root to read `src/modules/` from
 * @param argv - the script's own arguments (`process.argv.slice(2)`)
 * @returns the module folder names, each once
 * @throws {Error} when `--modules` is bare or empty, names a folder that is not a module, or
 *   leaves a module standing whose `dependsOn` names a stripped one
 */
export const resolveStripModules = (repoRoot: string, argv: readonly string[]): string[] => {
    /**
     * Node: https://nodejs.org/api/util.html#utilparseargsconfig — `strict: false` lets other
     * flags through; a string option given with no value reads as `true`.
     */
    const { values } = parseArgs({
        args: [...argv],
        options: { modules: { type: 'string' } },
        strict: false,
        allowPositionals: true
    });
    if (values.modules === undefined) return readDemoModuleNames(repoRoot);
    // A bare `--modules` reads as `true`: no list, which the empty-list refusal below turns away.
    const requested = typeof values.modules === 'string' ? values.modules : '';

    const names = [
        ...new Set(
            requested
                .split(',')
                .map((name) => name.trim())
                .filter(Boolean)
        )
    ];
    if (names.length === 0) throw new Error('--modules names no module');

    const descriptors = readAllModuleDescriptors(path.join(repoRoot, 'src', 'modules'));
    const unknown = names.filter((name) => !(name in descriptors));
    if (unknown.length > 0)
        throw new Error(`--modules names no such module: ${unknown.join(', ')}`);

    const stranded = Object.entries(descriptors)
        .filter(([name]) => !names.includes(name))
        .flatMap(([name, descriptor]) =>
            descriptor.dependsOn
                .filter((dependency) => names.includes(dependency))
                .map((dependency) => `${name} depends on ${dependency}`)
        );
    if (stranded.length > 0)
        throw new Error(
            `--modules strips a module another one still needs: ${stranded.join('; ')}`
        );
    return names;
};
