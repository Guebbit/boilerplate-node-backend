#!/usr/bin/env tsx
/**
 * G-D2 step 1: measure how far "the demo shop is removable" actually is — `npm run measure:demo-strip`.
 *
 * NOT `demo:strip`/`demo:remove`, and not meant to be green. This is the "measure first" half of
 * G-D2's `B` option: copy the checkout, delete every `group: shop` module folder (DDD-D1), and run
 * `ts-check`, the cross-cutting suite and `docs:build` against what is left. Whatever breaks — a
 * dangling import in `src/modules.ts`, a foundation module reaching for something a shop module
 * owned, a doc page citing a deleted path — is exactly the punch list the later "one command" work
 * (CT-D3, CT-D4, then a real `demo:remove`) has to clear. Report-only, on purpose: turning this
 * red would block every PR on work this step is not scoped to do.
 *
 * Runs against a SCRATCH COPY, never this checkout — `rm -rf src/modules/orders` in the real tree
 * is not a measurement. `node_modules` is symlinked rather than copied (or reinstalled): the
 * question is what the SOURCE looks like with the shop gone, not whether npm still works.
 *
 * See: docs/theory/strategic-ddd.md#4a-foundation-and-shop
 */

import { cpSync, mkdirSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { readModuleDescriptor } from '../docs/module-descriptor';

/** Repo root, two levels up from `scripts/testing/`. */
const REPO_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Where the scratch copy is assembled — under the OS temp directory, never under `REPO_ROOT`:
 * `fs.cpSync` refuses a destination that is a subdirectory of its own source, and a copy under
 * `tmp/` would be exactly that.
 */
const SCRATCH = path.join(os.tmpdir(), 'demo-strip-measure');

/** Top-level entries never copied into the scratch tree — regenerated or symlinked instead. */
const SKIP_ENTRIES = new Set(['node_modules', '.git', 'tmp']);

/** One command this script runs against the scratch tree, and what it is asked about. */
interface Check {
    label: string;
    command: string;
    args: readonly string[];
}

/** `ts-check`, the cross-cutting suite, and the docs build — the three G-D2 asks for. */
const CHECKS: readonly Check[] = [
    { label: 'ts-check', command: 'npm', args: ['run', 'ts-check'] },
    { label: 'test:cross-cutting', command: 'npm', args: ['run', 'test:cross-cutting'] },
    { label: 'docs:build', command: 'npm', args: ['run', 'docs:build'] }
];

/**
 * Every module folder labelled `group: shop` — read fresh, off each module's own `module.yaml`
 * via the same typed reader `generate-module-graph.ts` uses for `subdomain`, so a relabelled
 * module changes the strip without an edit here.
 */
const shopModules = (): string[] => {
    const modulesRoot = path.join(REPO_ROOT, 'src', 'modules');
    return readdirSync(modulesRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter(
            (name) =>
                readModuleDescriptor(path.join(modulesRoot, name, 'module.yaml')).group === 'shop'
        );
};

/** Copy the checkout into `SCRATCH`, skipping what {@link SKIP_ENTRIES} names. */
const assembleScratchCopy = (): void => {
    rmSync(SCRATCH, { recursive: true, force: true });
    mkdirSync(SCRATCH, { recursive: true });

    cpSync(REPO_ROOT, SCRATCH, {
        recursive: true,
        filter: (source) => !SKIP_ENTRIES.has(path.relative(REPO_ROOT, source).split(path.sep)[0])
    });

    // Node resolves through the symlink exactly as it would a real directory — the scratch copy
    // needs working imports, not its own install.
    symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(SCRATCH, 'node_modules'), 'dir');
};

/** Delete every `group: shop` module folder from the scratch copy. */
const stripShopModules = (names: readonly string[]): void => {
    for (const name of names) {
        rmSync(path.join(SCRATCH, 'src', 'modules', name), { recursive: true, force: true });
    }
};

/**
 * Run one check against the scratch tree. Never throws — a failing command IS the measurement,
 * not this script's own error.
 * @param check - the command to run and what to call it in the report
 */
const run = (check: Check): boolean => {
    console.info(`\n[demo-strip] ${check.label}`);
    const result = spawnSync(check.command, check.args, { cwd: SCRATCH, stdio: 'inherit' });
    return result.status === 0;
};

const shop = shopModules();
console.info(`[demo-strip] stripping ${shop.length} group: shop module(s): ${shop.join(', ')}`);

assembleScratchCopy();
stripShopModules(shop);

const results = CHECKS.map((check) => ({ check, passed: run(check) }));

console.info('\n[demo-strip] summary — report-only, not a merge gate:');
for (const { check, passed } of results)
    console.info(`  ${passed ? 'PASS' : 'FAIL'}  ${check.label}`);

const allPassed = results.every((result) => result.passed);
console.info(
    allPassed
        ? '\n[demo-strip] the demo shop is removable today.'
        : '\n[demo-strip] the demo shop is NOT removable today — see the failing command(s) above ' +
              "for what still couples the foundation to it. Fixing this is CT-D3/CT-D4 and DDD-D5's job, not this script's."
);

process.exitCode = allPassed ? 0 : 1;
