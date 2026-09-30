/*
 * Relative/`node:*` imports only: `file-sandbox.ts` pulls `REPO_ROOT` from here, and
 * `globalSetup`/`globalTeardown` load THAT outside `moduleNameMapper` — an aliased import
 * anywhere on this chain would resolve on the developer's machine, not in jest's worker.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * The repository root, for a test that walks the tree by hand — reading every module's contract
 * fragment, checking a generated file is up to date, that kind of thing. `__dirname`-relative
 * rather than `process.cwd()`, so it stays correct regardless of where jest was invoked from.
 */
export const REPO_ROOT = path.join(__dirname, '..', '..');

/** Every module's home directory — `src/modules`, one subdirectory per module. */
export const MODULES_ROOT = path.join(REPO_ROOT, 'src', 'modules');

/**
 * Whether a module's folder is in this checkout. A test that names an exact expected set of
 * things a module owns filters that set through this, so deleting the module (`demo:remove`)
 * shrinks the expectation instead of failing it — the sweep is still exact for what remains.
 * @param moduleName - the folder name under `src/modules/`
 */
export const isDeployed = (moduleName: string): boolean =>
    existsSync(path.join(MODULES_ROOT, moduleName));
