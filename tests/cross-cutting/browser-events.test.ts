/**
 * A module's browser events are declared twice, and the two must agree: the request shapes in its
 * `openapi.browser-events.yaml` (what the contract accepts) and `AppModule.browserEvents` on its
 * manifest (what the relay can turn into an analytics event). A name only in the fragment is
 * accepted and silently dropped; a name only on the manifest is unreachable.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { isDeployed, MODULES_ROOT } from '@tests/paths';
import { enabledModules } from '../../src/modules';

/** The event names a module's fragment declares, `undefined` when it ships none. */
const declaredBy = (moduleName: string): string[] | undefined => {
    const file = path.join(MODULES_ROOT, moduleName, 'openapi.browser-events.yaml');
    if (!existsSync(file)) return undefined;
    const document = parse(readFileSync(file, 'utf8')) as {
        components: { schemas: Record<string, { properties: { event: { enum: string[] } } }> };
    };
    return Object.values(document.components.schemas).flatMap(
        (schema) => schema.properties.event.enum
    );
};

describe('browser events: contract fragment and manifest agree', () => {
    const owners = enabledModules.filter(
        (appModule) => appModule.browserEvents !== undefined || declaredBy(appModule.name)
    );

    it('finds an owner whenever `products`, the module that declares one, is deployed', () => {
        // The canary for the table below: no owner must mean "none is deployed", never "the
        // fragment stopped being read".
        if (isDeployed('products')) expect(owners.length).toBeGreaterThanOrEqual(1);
    });

    // `it.each` rejects an empty table outright, so the per-owner check exists only with an owner.
    if (owners.length > 0)
        it.each(owners.map((appModule) => [appModule.name, appModule] as const))(
            '%s registers exactly the events its fragment declares',
            (name, appModule) => {
                expect(Object.keys(appModule.browserEvents ?? {}).toSorted()).toEqual(
                    (declaredBy(name) ?? []).toSorted()
                );
            }
        );
});
