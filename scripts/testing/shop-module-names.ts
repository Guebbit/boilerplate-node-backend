/**
 * @module
 * One shared reader for "which module folders are `group: shop` today" — the same question
 * `measure-demo-strip.ts` (report-only) and `demo-remove.ts` (the real strip, G-D2 step 3) both
 * ask, off each module's own `module.yaml` rather than a hand-kept list. A relabelled module
 * changes both scripts without an edit to either.
 */

import { readdirSync } from 'node:fs';
import path from 'node:path';
import { readModuleDescriptor } from '../docs/module-descriptor';

/**
 * Every module folder under `src/modules/<repoRoot>` labelled `group: shop` — see
 * `docs/theory/strategic-ddd.md#4a-foundation-and-shop`.
 * @param repoRoot - the checkout root to read `src/modules/` from (a scratch copy, or the real one)
 */
export const readShopModuleNames = (repoRoot: string): string[] => {
    const modulesRoot = path.join(repoRoot, 'src', 'modules');
    return readdirSync(modulesRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter(
            (name) =>
                readModuleDescriptor(path.join(modulesRoot, name, 'module.yaml')).group === 'shop'
        );
};
