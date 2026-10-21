#!/usr/bin/env tsx
/**
 * `npm run demo:remove` — the actual one-command strip. `measure:demo-strip` is its measuring
 * twin: same recipe, run against a scratch copy.
 *
 * Deletes every `group: shop` and `group: example` module folder (its scheduled jobs go with it,
 * and `regenerate` rewrites the crontab), the seed images, and the demo
 * catalogue's own scenario data — then edits `src/modules.ts` and regenerates the scenario
 * registries (`npm run regenerate`), the only central files that would otherwise stop the
 * repo compiling. See `docs/getting-started-new-project.md` for what this promises and does not.
 *
 * RUNS AGAINST THIS CHECKOUT, not a scratch copy — this is the real command, not the measurement.
 * A module-owned test under `src/modules/<name>/tests/` goes with its folder; any other test that
 * imports a removed module goes too (`demo-remove-tests.ts`), and the report lists each one.
 */

import { readDemoModuleNames } from '../testing/demo-module-names';
import { removeModules } from './demo-remove-modules';
import type { RemovalNote } from './demo-remove-registry';
import { removeSeedImages, removeShopOnlyScenarioFiles } from './demo-remove-scenarios';
import { formatWithRepoConfig } from './format-text';
import { writeScenarioRegistries } from './scenario-registry';
import { REPO_ROOT } from '../modules-on-disk';

/** Print every step's own report line. */
const report = (notes: readonly RemovalNote[]): void => {
    for (const note of notes) console.info(`  ${note.file} — ${note.detail}`);
};

/** The module folders to strip: every one labelled `group: shop` or `group: example`. */
const demoModuleNames = readDemoModuleNames(REPO_ROOT);

/** Announce the strip before touching anything. */
console.info(
    `[demo-remove] removing ${demoModuleNames.length} group: shop / group: example module(s): ${demoModuleNames.join(', ')}`
);

/** Step one: delete the module folders and edit the central files that name them. */
console.info('\n[demo-remove] the modules, and everything central that names them:');
report(removeModules(REPO_ROOT, demoModuleNames));

/** Step two: delete the demo catalogue's data. Nothing is edited: the registries are step three. */
console.info('\n[demo-remove] the demo catalogue:');
report(removeSeedImages(REPO_ROOT));
report(removeShopOnlyScenarioFiles(REPO_ROOT));

/**
 * Step three: regenerate the registries that listed the deleted files — the one rewrite the strip
 * makes, and a generated one — then say what to do next.
 */
void writeScenarioRegistries(REPO_ROOT, formatWithRepoConfig).then((written) => {
    console.info('\n[demo-remove] the scenario registries, rebuilt from what is left:');
    report(written.map((file) => ({ file, detail: 'regenerated' })));
    // What the person running this must do next, since the edits above are not yet verified.
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
});
