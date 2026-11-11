/**
 * Every `dependsOn` in a `module.yaml` names a real module. The rest of a descriptor's hygiene
 * (present, strict schema) fails `npm run check` through the module-graph step.
 */

import { readdirSync } from 'node:fs';
import path from 'node:path';
import { readModuleDescriptor } from '../../scripts/docs/module-descriptor';
import { MODULES_ROOT } from '@tests/paths';

/** Every module folder, read off disk rather than off the registry — a descriptor is required whether or not the module is enabled. */
const moduleNames = readdirSync(MODULES_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();

describe.each(moduleNames)('%s/module.yaml', (name) => {
    it('names only real modules', () => {
        const { dependsOn } = readModuleDescriptor(path.join(MODULES_ROOT, name, 'module.yaml'));

        for (const sibling of dependsOn) expect(moduleNames).toContain(sibling);
    });
});
