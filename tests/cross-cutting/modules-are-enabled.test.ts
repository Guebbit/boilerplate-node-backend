/**
 * Every folder under `src/modules/` is a module `modules.ts` enables, and nothing in `modules.ts`
 * names a folder that isn't there.
 *
 * A module that exists on disk but is missing from `enabledModules` fails silently: no route
 * 404s in a way anyone notices during development, no error at boot, and the first symptom is a
 * missing endpoint in production. `AppModule.name` is documented to match its folder
 * (`src/kernel/registry.ts`), so this sweep checks that promise holds in both directions.
 */

import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { enabledModules } from '../../src/modules';

const MODULES_ROOT = path.join(__dirname, '../../src/modules');

/** Every directory under `src/modules/`. */
const moduleFolders = (): string[] =>
    readdirSync(MODULES_ROOT).filter((entry) =>
        statSync(path.join(MODULES_ROOT, entry)).isDirectory()
    );

describe('modules are enabled', () => {
    it('finds folders to check', () => {
        // The canary. An empty sweep must mean "no modules exist", which would itself be a
        // finding — not "the sweep broke and every assertion below passed vacuously".
        expect(moduleFolders().length).toBeGreaterThan(0);
    });

    it('enables every module folder that exists', () => {
        const enabledNames = new Set(enabledModules.map((appModule) => appModule.name));
        const missing = moduleFolders().filter((folder) => !enabledNames.has(folder));

        expect(missing).toEqual([]);
    });

    it('names no module without a folder', () => {
        const folders = new Set(moduleFolders());
        const orphaned = enabledModules
            .map((appModule) => appModule.name)
            .filter((name) => !folders.has(name));

        expect(orphaned).toEqual([]);
    });
});
