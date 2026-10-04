/**
 * @module
 * Taking any set of modules out of the tree — the part of a removal that does not care WHICH
 * modules: their folders, the registry line that names them, the shared authorization files, the reap/sweep scripts they own, their test doubles and the tests that need them.
 *
 * `demo-remove.ts` calls this with every `group: shop` module and then does the shop-only work
 * (the demo catalogue, the scenarios); `measure-demo-strip.ts` calls it with `locales` for its
 * second recipe. One function, so the two cannot drift.
 */

import {
    readRemovedAuthorization,
    stripConformanceCases,
    stripRoleGrants
} from './demo-remove-authorization';
import {
    removeModuleFolders,
    removeShopOwnedOpsScripts,
    stripModuleRegistry,
    type RemovalNote
} from './demo-remove-registry';
import { stripModuleDoubles, stripScenarioModuleEntries } from './demo-remove-scenarios';
import { removeResidueTests } from './demo-remove-tests';

/**
 * Remove modules from the checkout at `repoRoot`.
 *
 * Order matters in one place: the permission keys are read from each module's own fragment, so
 * that read happens before the folders go.
 * @param repoRoot - the checkout to edit (this one, or a scratch copy)
 * @param names - the module folders to remove
 * @returns one note per edit, in the order they were made
 */
export const removeModules = (repoRoot: string, names: readonly string[]): RemovalNote[] => {
    const removedAuthorization = readRemovedAuthorization(repoRoot, names);

    return [
        ...removeModuleFolders(repoRoot, names),
        stripModuleRegistry(repoRoot, names),
        ...removeShopOwnedOpsScripts(repoRoot, names),
        stripScenarioModuleEntries(repoRoot, names),
        ...stripModuleDoubles(repoRoot, names),
        stripRoleGrants(repoRoot, removedAuthorization),
        stripConformanceCases(repoRoot, removedAuthorization),
        ...removeResidueTests(repoRoot, names)
    ];
};
