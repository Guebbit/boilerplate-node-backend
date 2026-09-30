#!/usr/bin/env tsx
/**
 * G-D2 step 3 / FE-D4: `npm run demo:remove` — the actual one-command strip, once
 * `measure:demo-strip` (step 1) and CT-D3/CT-D4/DDD-D5 (step 2) made it small enough to be one.
 *
 * Deletes every `group: shop` module folder, the reap/sweep scripts and `docker/crontab`/
 * `package.json` lines that belong to one, and the demo catalogue's own scenario data — then edits
 * the handful of central files (`src/modules.ts`, `tests/support/routed-modules.ts`,
 * `scripts/contracts/client-collections-bundle.ts`, `scenarios/*`) that would otherwise stop the
 * repo compiling. See `docs/getting-started-new-project.md` for what this promises and does not.
 *
 * RUNS AGAINST THIS CHECKOUT, not a scratch copy — this is the real command, not the measurement.
 * A module-owned test under `src/modules/<name>/tests/` goes with its folder automatically; a
 * SYSTEM-level test that used a shop domain as sample data (`docs/theory/module-lifecycle.md`'s
 * "residue" pile) is left for a human to judge, and this script's own report lists candidates.
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { readShopModuleNames } from '../testing/shop-module-names';
import {
    removeModuleFolders,
    removeShopOwnedOpsScripts,
    stripModuleRegistry,
    stripRoutedModules,
    type RemovalNote
} from './demo-remove-registry';
import {
    removeGeneratedProductImages,
    removeShopOnlyScenarioFiles,
    stripClientCollections,
    stripScenarioIndex,
    stripSeedImageGenerator,
    stripShopModulesTable,
    stripSubjects
} from './demo-remove-scenarios';
import { stripAccountExportSchema, stripContractPathCensus } from './demo-remove-contract';

/** Repo root, two levels up from `scripts/ops/`. */
const REPO_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Every `tests/**` file that still imports a path this run deleted — read via `git grep` rather
 * than re-parsing each file by hand, since the question is exactly what that tool is for. Printed
 * as a punch list, never edited: `docs/theory/module-lifecycle.md`'s "residue" pile is a judgement
 * call about what a test was FOR, which this script cannot make on an adopter's behalf.
 * @param names - the shop module names this run just deleted
 */
const findResidueTests = (names: readonly string[]): string[] => {
    const pattern = names.map((name) => `@modules/${name}/|modules/${name}/`).join('|');
    try {
        // `git grep`: -l lists matching FILE NAMES only, -E is extended regex, -I skips binary
        // files. Exit code 1 means "no matches" — a normal outcome, not a failure.
        // https://git-scm.com/docs/git-grep
        const result = execFileSync('git', ['grep', '-l', '-I', '-E', pattern, '--', 'tests/'], {
            cwd: REPO_ROOT,
            encoding: 'utf8'
        });
        return result.split('\n').filter((line) => line.length > 0);
    } catch (error: unknown) {
        const status = error instanceof Error && 'status' in error ? error.status : undefined;
        if (status === 1) return [];
        throw error;
    }
};

/** Print every step's own report line. */
const report = (notes: readonly RemovalNote[]): void => {
    for (const note of notes) console.info(`  ${note.file} — ${note.detail}`);
};

const shopModuleNames = readShopModuleNames(REPO_ROOT);
console.info(
    `[demo-remove] removing ${shopModuleNames.length} group: shop module(s): ${shopModuleNames.join(', ')}`
);

console.info('\n[demo-remove] module folders:');
report(removeModuleFolders(REPO_ROOT, shopModuleNames));

console.info('\n[demo-remove] the module registry:');
report([
    stripModuleRegistry(REPO_ROOT, shopModuleNames),
    stripRoutedModules(REPO_ROOT, shopModuleNames)
]);

console.info('\n[demo-remove] reap/sweep scripts, package.json and docker/crontab:');
report(removeShopOwnedOpsScripts(REPO_ROOT, shopModuleNames));

console.info('\n[demo-remove] the demo catalogue and its generated collections:');
report(removeGeneratedProductImages(REPO_ROOT));
report(removeShopOnlyScenarioFiles(REPO_ROOT));
report([
    stripShopModulesTable(REPO_ROOT),
    stripScenarioIndex(REPO_ROOT),
    stripSubjects(REPO_ROOT),
    stripClientCollections(REPO_ROOT),
    stripSeedImageGenerator(REPO_ROOT)
]);

console.info('\n[demo-remove] the shared contract fragment (shared/contracts/openapi.root.yaml):');
report([stripContractPathCensus(REPO_ROOT, shopModuleNames), stripAccountExportSchema(REPO_ROOT)]);

console.info('\n[demo-remove] done. Next:');
console.info(
    '  1. npm run regenerate   — rebuild the contract bundles and every generated doc page'
);
console.info(
    '  2. npm run ts-check     — the module-owned tests are already gone; what is left is'
);
console.info(
    '                            residue: a system-level test that used the shop as sample'
);
console.info(
    '                            data (docs/theory/module-lifecycle.md). Delete or rewrite'
);
console.info('                            each one by hand — this script will not guess for you.');

const residue = findResidueTests(shopModuleNames);
if (residue.length > 0) {
    console.info(`\n[demo-remove] candidates, from a grep for the deleted modules under tests/:`);
    for (const file of residue) console.info(`  ${file}`);
}
