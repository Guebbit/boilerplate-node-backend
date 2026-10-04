/**
 * @module
 * One shared reader for "which module folders does `demo:remove` take today" — the `group: shop`
 * ones and the `group: example` one. The same question `measure-demo-strip.ts` (report-only) and
 * `demo-remove.ts` (the real strip) both ask, off each module's own `module.yaml` rather than a
 * hand-kept list. A relabelled module changes both scripts without an edit to either.
 */

import { readdirSync } from 'node:fs';
import path from 'node:path';
import { readModuleDescriptor } from '../docs/module-descriptor';

/** The `module.yaml` groups `demo:remove` deletes: everything but `foundation`. */
const REMOVABLE_GROUPS: ReadonlySet<string> = new Set(['shop', 'example']);

/**
 * Every module folder under `src/modules/<repoRoot>` labelled `group: shop` or `group: example` —
 * see `docs/theory/strategic-ddd.md#4a-foundation-and-shop`. The example module is the template to
 * copy; a deployment that has copied it deletes it, and it is mounted in production (anyone can
 * create a note), so the strip takes it too.
 * @param repoRoot - the checkout root to read `src/modules/` from (a scratch copy, or the real one)
 */
export const readDemoModuleNames = (repoRoot: string): string[] => {
    const modulesRoot = path.join(repoRoot, 'src', 'modules');
    return readdirSync(modulesRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) =>
            REMOVABLE_GROUPS.has(
                readModuleDescriptor(path.join(modulesRoot, name, 'module.yaml')).group
            )
        );
};
