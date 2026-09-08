/**
 * @module
 * Every permission key belongs to a module that exists, and every module claims exactly the keys
 * the shared file attributes to it.
 *
 * WHY BOTH DIRECTIONS. `shared/authorization-keys.yaml` says which module owns each key; each
 * module's manifest says which keys it introduces. Either one alone rots in a way nobody notices:
 *
 *   - a key whose module has been deleted stays in the file forever — grantable by a role editor,
 *     checked by nothing, and indistinguishable from a key that works;
 *   - a module that declares a key the file does not attribute to it is claiming something no
 *     route can check, which reads as a permission that exists and does not.
 *
 * "Deleting a module deletes its keys" is the property this makes true. `rm -rf` a module and this
 * fails until the keys go with it — which is the same guarantee `check:docs-graph` gives the docs
 * and `depcruise` gives the imports.
 */

import { enabledModules } from '../../src/modules';
import { PERMISSION_KEYS } from '@kernel/permissions';

/** What each module claims, from its own manifest. */
const claimed = new Map(
    enabledModules.map((appModule) => [
        appModule.name,
        [...(appModule.permissions ?? [])].toSorted()
    ])
);

/** What the shared file attributes to each module. */
const attributed = new Map<string, string[]>();

for (const key of PERMISSION_KEYS) {
    attributed.set(key.module, [...(attributed.get(key.module) ?? []), key.key].toSorted());
}

describe('the declared keys and the modules that own them', () => {
    it('name a module that is actually enabled', () => {
        // The failure this catches: a module deleted, its keys left behind. They would still be
        // assignable to a role and would still look like permissions.
        expect([...attributed.keys()].filter((module) => !claimed.has(module))).toEqual([]);
    });

    it.each([...attributed.entries()])(
        '%s claims exactly the keys attributed to it',
        (module: string, keys: string[]) => {
            expect(claimed.get(module)).toEqual(keys);
        }
    );

    it('leave a module that introduces none claiming none', () => {
        // `cart`, `wishlist` and `antibot` are *your own things* or infrastructure — what you may
        // do with them follows from being signed in, not from a role. An empty claim here is a
        // decision, and a key appearing under one of them would be a change of model.
        const keyless = [...claimed.entries()]
            .filter(([, keys]) => keys.length === 0)
            .map(([module]) => module)
            .toSorted();

        expect(keyless).toEqual(['antibot', 'cart', 'wishlist']);
    });

    it('find every key somewhere, so the two lists are the same set', () => {
        const claimedKeys = [...claimed.values()].flat().toSorted();

        expect(claimedKeys).toEqual(PERMISSION_KEYS.map((key) => key.key).toSorted());
    });
});
