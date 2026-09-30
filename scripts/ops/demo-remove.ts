#!/usr/bin/env tsx
/**
 * G-D2 step 3 / FE-D4: `npm run demo:remove` — the actual one-command strip, once
 * `measure:demo-strip` (step 1) and CT-D3/CT-D4/DDD-D5 (step 2) made it small enough to be one.
 *
 * Deletes every `group: shop` module folder, the reap/sweep scripts and `docker/crontab`/
 * `package.json` lines that belong to one, and the demo catalogue's own scenario data — then edits
 * the handful of central files (`src/modules.ts`,
 * `scripts/contracts/client-collections-bundle.ts`, `scenarios/*`) that would otherwise stop the
 * repo compiling. See `docs/getting-started-new-project.md` for what this promises and does not.
 *
 * RUNS AGAINST THIS CHECKOUT, not a scratch copy — this is the real command, not the measurement.
 * A module-owned test under `src/modules/<name>/tests/` goes with its folder; any other test that
 * imports a removed module goes too (`demo-remove-tests.ts`), and the report lists each one.
 */

import path from 'node:path';
import { readShopModuleNames } from '../testing/shop-module-names';
import { removeModules } from './demo-remove-modules';
import type { RemovalNote } from './demo-remove-registry';
import {
    removeGeneratedProductImages,
    removeShopOnlyScenarioFiles,
    stripClientCollections,
    stripScenarioIndex,
    stripSeedImageGenerator,
    stripShopModulesTable,
    stripSubjects
} from './demo-remove-scenarios';
import { stripAccountExportSchema } from './demo-remove-contract';

/** Repo root, two levels up from `scripts/ops/`. */
const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** Print every step's own report line. */
const report = (notes: readonly RemovalNote[]): void => {
    for (const note of notes) console.info(`  ${note.file} — ${note.detail}`);
};

const shopModuleNames = readShopModuleNames(REPO_ROOT);
console.info(
    `[demo-remove] removing ${shopModuleNames.length} group: shop module(s): ${shopModuleNames.join(', ')}`
);

console.info('\n[demo-remove] the modules, and everything central that names them:');
report(removeModules(REPO_ROOT, shopModuleNames));

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
report([stripAccountExportSchema(REPO_ROOT)]);

console.info('\n[demo-remove] done. Next:');
console.info(
    '  1. npm run regenerate   — rebuild the contract bundles and every generated doc page'
);
console.info(
    '  2. npm run ts-check     — anything it still reports names the removed modules in a'
);
console.info(
    '                            string or a table rather than an import; fix it by hand.'
);
