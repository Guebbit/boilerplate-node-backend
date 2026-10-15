/**
 * @module
 * Where the repo and its modules are on disk — the one place a script asks. Every build step that
 * wants "each module that ships X" (a contract fragment, a probe list, a descriptor) reads it here
 * instead of re-walking `src/modules` its own way.
 */

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

/** The repo root, one level up from `scripts/`. */
export const REPO_ROOT = path.resolve(__dirname, '..');

/** The real `src/modules` directory. */
export const MODULES_ROOT = path.join(REPO_ROOT, 'src', 'modules');

/**
 * The module folders that carry a given file or folder.
 *
 * Takes the root rather than assuming the real one: a test points it at a scratch tree.
 *
 * @param modulesRoot - a `src/modules` directory (the real one, or a scratch copy)
 * @param file - what the module must carry, relative to its folder (`openapi.yaml`, `tests`)
 * @returns the module names, alphabetically; callers wanting a narrative order pass them to `orderSections`
 */
export const modulesWith = (modulesRoot: string, file: string): string[] =>
    readdirSync(modulesRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) => existsSync(path.join(modulesRoot, name, file)))
        .toSorted();
