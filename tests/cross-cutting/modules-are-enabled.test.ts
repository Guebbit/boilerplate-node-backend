/**
 * Every folder under `src/modules/` is a module `modules.ts` enables.
 *
 * A module that exists on disk but is missing from `enabledModules` fails silently: no route
 * 404s in a way anyone notices during development, no error at boot, and the first symptom is a
 * missing endpoint in production. `AppModule.name` is documented to match its folder
 * (`src/kernel/registry.ts`).
 */

import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { enabledModules } from '../../src/modules';
import { MODULES_ROOT } from '@tests/paths';

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
});
