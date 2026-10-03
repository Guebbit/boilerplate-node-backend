#!/usr/bin/env tsx
/**
 * Measure how far "a module is removable" actually is — `npm run measure:demo-strip
 * [-- --recipe shop|locales]`.
 *
 * NOT `demo:remove`, and not meant to be green. It applies a removal RECIPE to a scratch copy of
 * the checkout, regenerates, then runs `ts-check`, the cross-cutting suite and `docs:build`
 * against what is left. Whatever breaks is the punch list:
 *
 * | recipe   | what it does                                                                    |
 * | -------- | ------------------------------------------------------------------------------- |
 * | `shop`   | the real `demo:remove` — every `group: shop` module plus the files that name it |
 * | `locales`| the optional-locales recipe: the folder and every registry line that names it   |
 *
 * Report-only, on purpose: turning this red would block every PR on work this step is not scoped
 * to do. Promote it into the `ci` gate once it is green.
 *
 * Runs against a SCRATCH COPY, never this checkout (`scripts/testing/scratch-copy.ts`).
 *
 * See: docs/theory/strategic-ddd.md#4a-foundation-and-shop
 */

import os from 'node:os';
import path from 'node:path';
import { removeModules } from '../ops/demo-remove-modules';
import { readShopModuleNames } from './shop-module-names';
import { assembleScratchCopy, runIn } from './scratch-copy';

/** Repo root, two levels up from `scripts/testing/`. */
const REPO_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Where the scratch copy is assembled — under the OS temp directory, never under `REPO_ROOT`:
 * `fs.cpSync` refuses a destination that is a subdirectory of its own source, and a copy under
 * `tmp/` would be exactly that.
 */
const SCRATCH = path.join(os.tmpdir(), 'demo-strip-measure');

/** One command this script runs against the scratch tree, and what it is asked about. */
interface Check {
    label: string;
    command: string;
    args: readonly string[];
}

/**
 * `regenerate` (an adopter's own first step after a removal), then `ts-check`, the cross-cutting
 * suite and the docs build — the three checks a removal must keep green. A failing `regenerate` is a finding, so the
 * later checks still run against whatever it left.
 */
const CHECKS: readonly Check[] = [
    { label: 'regenerate', command: 'npm', args: ['run', 'regenerate', '--', '--no-sync'] },
    { label: 'ts-check', command: 'npm', args: ['run', 'ts-check'] },
    { label: 'test:cross-cutting', command: 'npm', args: ['run', 'test:cross-cutting'] },
    { label: 'docs:build', command: 'npm', args: ['run', 'docs:build'] }
];

/** A removal recipe: how to take one kind of module out of the scratch copy. */
interface Recipe {
    /** Applies the removal to the scratch tree. */
    apply: () => void;
    /** What the report says was removed. */
    describe: () => string;
}

/**
 * Run a command in the scratch tree, refusing to go on when it fails: a recipe that does not
 * apply is a broken measurement, not a finding.
 * @param command - the executable
 * @param commandArguments - its arguments
 */
const runInScratch = (command: string, commandArguments: readonly string[]): void => {
    if (!runIn(SCRATCH, command, commandArguments))
        throw new Error(
            `[demo-strip] \`${command} ${commandArguments.join(' ')}\` failed while applying the recipe.`
        );
};

/**
 * The optional-locales recipe: the folder and every registry line that names it. What still
 * imports it afterwards is the punch list.
 */
const LOCALES: readonly string[] = ['locales'];

/** Every recipe this script knows, keyed by the `--recipe` value. */
const RECIPES: Partial<Record<string, Recipe>> = {
    shop: {
        // The real command, inside the scratch copy: `__dirname` there resolves to the scratch root.
        apply: () => {
            runInScratch('npx', ['tsx', 'scripts/ops/demo-remove.ts']);
        },
        describe: () => `every group: shop module (${readShopModuleNames(REPO_ROOT).join(', ')})`
    },
    locales: {
        apply: () => {
            removeModules(SCRATCH, LOCALES);
        },
        describe: () => 'the locales module'
    }
};

/**
 * Run one check against the scratch tree. Never throws — a failing command IS the measurement,
 * not this script's own error.
 * @param check - the command to run and what to call it in the report
 */
const run = (check: Check): boolean => {
    console.info(`\n[demo-strip] ${check.label}`);
    return runIn(SCRATCH, check.command, check.args);
};

const recipeName = process.argv.includes('--recipe')
    ? (process.argv[process.argv.indexOf('--recipe') + 1] ?? '')
    : 'shop';
const recipe = RECIPES[recipeName];
if (!recipe)
    throw new Error(
        `[demo-strip] unknown recipe "${recipeName}"; one of ${Object.keys(RECIPES).join(', ')}.`
    );

console.info(`[demo-strip] recipe ${recipeName}: removing ${recipe.describe()}`);

assembleScratchCopy(REPO_ROOT, SCRATCH);
recipe.apply();
const results = CHECKS.map((check) => ({ check, passed: run(check) }));

console.info(`\n[demo-strip] summary (${recipeName}) — report-only, not a merge gate:`);
for (const { check, passed } of results)
    console.info(`  ${passed ? 'PASS' : 'FAIL'}  ${check.label}`);

const allPassed = results.every((result) => result.passed);
console.info(
    allPassed
        ? `\n[demo-strip] the ${recipeName} recipe leaves a working repo.`
        : `\n[demo-strip] the ${recipeName} recipe leaves failures — see the failing command(s) above ` +
              'for what still couples the rest of the repo to what was removed.'
);

process.exitCode = allPassed ? 0 : 1;
