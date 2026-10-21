/**
 * @module
 * Taking any set of modules out of the tree — the part of a removal that does not care WHICH
 * modules: their folders, the registry line that names them, the shared authorization files, the
 * alert rules on their metrics, the validation labels only their fields used, the reap/sweep
 * scripts they own, their scenario files and test doubles and the tests that need them. The
 * registries that listed those files are NOT edited: `npm run regenerate` rebuilds them,
 * and `regenerate` runs it.
 *
 * `demo-remove.ts` calls this with every `group: shop` module and then does the shop-only work
 * (the demo catalogue, the scenarios); `measure-demo-strip.ts` calls it with `locales` for its
 * second recipe. One function, so the two cannot drift.
 */

import { readRemovedMetrics, stripAlertRules } from './demo-remove-alert-rules';
import { readRemovedFields, stripValidationLabels } from './demo-remove-validation-labels';
import {
    readRemovedAuthorization,
    stripConformanceCases,
    stripRoleGrants
} from './demo-remove-authorization';
import { removeModuleFolders, stripModuleRegistry, type RemovalNote } from './demo-remove-registry';
import { removeScenarioModuleFiles } from './demo-remove-scenarios';
import { removeResidueTests } from './demo-remove-tests';

/**
 * Remove modules from the checkout at `repoRoot`.
 *
 * Order matters in one place: the permission keys, the metrics and the request fields are read
 * from each module's own files, so those reads happen before the folders go.
 * @param repoRoot - the checkout to edit (this one, or a scratch copy)
 * @param names - the module folders to remove
 * @returns one note per edit, in the order they were made
 */
export const removeModules = (repoRoot: string, names: readonly string[]): RemovalNote[] => {
    const removedAuthorization = readRemovedAuthorization(repoRoot, names);
    const removedMetrics = readRemovedMetrics(repoRoot, names);
    const removedFields = readRemovedFields(repoRoot, names);

    return [
        ...removeModuleFolders(repoRoot, names),
        stripModuleRegistry(repoRoot, names),
        ...removeScenarioModuleFiles(repoRoot, names),
        stripRoleGrants(repoRoot, removedAuthorization),
        stripConformanceCases(repoRoot, removedAuthorization),
        ...stripAlertRules(repoRoot, removedMetrics),
        ...stripValidationLabels(repoRoot, removedFields),
        ...removeResidueTests(repoRoot, names)
    ];
};
