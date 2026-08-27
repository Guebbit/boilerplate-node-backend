/**
 * Every file inside a module folder is a shape this repository has a name for.
 *
 * A module is a vocabulary, not a free-form directory: a manifest, a router, controllers, a
 * service tier, a repository, a model, the optional extension points, the contract slices and the
 * tests. `src/modules/<name>/` holding something outside that list is either a new shape worth
 * naming or a file in the wrong place, and both are worth stopping at review rather than
 * discovering later.
 *
 * WHAT THIS FILE IS NOT. It does not describe the shapes — `docs/reference/src-modules.md` does
 * that, in prose, for a reader. The catalogue below is patterns only, deliberately: descriptions
 * kept beside the patterns were a second copy of that page, and the two had already forked (the
 * page called `probes.ts` a readiness contribution, which it is not). One place says what a shape
 * IS; this one says which shapes EXIST.
 *
 * Adding a shape is therefore two lines in two files, and that is the point — a new kind of file in
 * the module vocabulary is a deliberate act.
 *
 * Ordering is irrelevant here. It mattered when each pattern carried a description and the most
 * specific had to win; membership is a set question, so `services/index.ts` and `domain/index.ts`
 * are gone — their parent patterns already match them.
 *
 * See: docs/reference/src-modules.md · docs/theory/modules.md#what-a-module-contains
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { enabledModules } from '../../src/modules';

const MODULES_ROOT = path.join(__dirname, '../../src/modules');

/**
 * Every path shape allowed inside `src/modules/<name>/`, matched against the module-relative path.
 *
 * A file matching none of these fails the suite by name. That failure is the whole point: it says
 * "this shape has no name yet", and the fix is to add the pattern here and its row to
 * `docs/reference/src-modules.md` — or to move the file somewhere it belongs.
 */
const MODULE_FILE_SHAPES: readonly RegExp[] = [
    /^module\.ts$/,
    /^index\.ts$/,
    /^routes\.ts$/,
    /^controllers\/.+\.ts$/,
    /^services\/.+\.ts$/,
    /^service\.ts$/,
    /^repository\.ts$/,
    /^model\.ts$/,
    /^domain\/.+\.ts$/,
    /^openapi\.yaml$/,
    /^asyncapi\.yaml$/,
    /^locales\/.+\.json$/,
    /^events\.ts$/,
    /^audit\.ts$/,
    /^metrics\.ts$/,
    /^analytics\.ts$/,
    /^emails\.ts$/,
    /^probes\.ts$/,
    /^demo\.ts$/,
    /^factory\.ts$/,
    /^config\.ts$/,
    /^tenants\.ts$/,
    /^session\/.+\.ts$/,
    /^providers\/.+\.ts$/,
    /^tests\/factory\.ts$/,
    /^tests\/unit\/.+\.ts$/,
    /^tests\/integration\/.+\.ts$/,
    /^tests\/contract\/.+\.ts$/
];

/** Every file under `directory`, as paths relative to it, skipping jest's snapshot folders. */
const walk = (directory: string, base = directory): string[] => {
    if (!existsSync(directory)) return [];
    return readdirSync(directory).flatMap((entry) => {
        const full = path.join(directory, entry);
        if (statSync(full).isDirectory()) return entry === '__snapshots__' ? [] : walk(full, base);
        return [path.relative(base, full).replaceAll('\\', '/')];
    });
};

/** Every module-relative path in the tree, tagged with the module it belongs to. */
const everyModuleFile = (): { module: string; file: string }[] =>
    enabledModules.flatMap((appModule) =>
        walk(path.join(MODULES_ROOT, appModule.name)).map((file) => ({
            module: appModule.name,
            file
        }))
    );

describe('every file in a module folder is a named shape', () => {
    it('actually reads the module tree', () => {
        // The canary: an empty result must mean "all named", never "nothing was scanned".
        expect(everyModuleFile().length).toBeGreaterThan(0);
    });

    it('finds no file matching no shape in the catalogue', () => {
        const unnamed = everyModuleFile()
            .filter(({ file }) => !MODULE_FILE_SHAPES.some((shape) => shape.test(file)))
            .map(({ module, file }) => `src/modules/${module}/${file}`);

        expect(unnamed).toEqual([]);
    });

    it('keeps the catalogue free of shapes nothing matches', () => {
        // The reverse reading. A pattern no file matches is a shape that was deleted, renamed, or
        // never existed — it costs nothing at runtime and quietly widens what the check accepts.
        const files = everyModuleFile().map(({ file }) => file);
        const unused = MODULE_FILE_SHAPES.filter(
            (shape) => !files.some((file) => shape.test(file))
        ).map((shape) => shape.source);

        expect(unused).toEqual([]);
    });
});
