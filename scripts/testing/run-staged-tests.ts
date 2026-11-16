#!/usr/bin/env tsx
/**
 * @module
 * Runs, by file, every test the commit being written adds or changes that the light gate does not
 * already cover — the integration, contract and fuzz files. `npm run test:staged`, the last step of
 * `.husky/pre-commit`.
 *
 * Why: `complete:light` skips every suite that needs `mongod`, so a new integration test would
 * otherwise first run at merge time, far from the commit that broke it.
 *
 * @see docs/reference/package-scripts.md#test-scripts
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { REPO_ROOT } from '../modules-on-disk';
import { isOutsideLightGate } from './suites';

/**
 * node:child_process `spawnSync`: the staged paths, NUL-separated (`-z`) so no filename is
 * mangled by quoting. `--diff-filter=AMR` keeps added, modified and renamed files; a deleted
 * test has nothing left to run.
 * https://git-scm.com/docs/git-diff#Documentation/git-diff.txt---diff-filterACDMRTUXB82308203
 */
const listed = spawnSync('git', ['diff', '--cached', '--name-only', '--diff-filter=AMR', '-z'], {
    cwd: REPO_ROOT,
    encoding: 'utf8'
});

// A failed `git` must fail the commit, not read as "nothing staged".
if (listed.status !== 0) {
    console.error(`[test:staged] git diff failed:\n${listed.stderr}`);
    process.exit(1);
}

/** Staged test files outside the light layers, still on disk (a partial stage can drop one). */
const files = listed.stdout
    .split('\0')
    .filter((path) => isOutsideLightGate(path) && existsSync(`${REPO_ROOT}/${path}`));

// Nothing staged that light leaves out: the commit is already fully gated.
if (files.length === 0) {
    console.log('[test:staged] no staged integration/contract/fuzz test');
    process.exit(0);
}

console.log(`[test:staged] ${files.length} file(s):\n  ${files.join('\n  ')}`);

/**
 * jest, in band: these layers share one in-memory mongod, so their files never run side by side.
 * `--runTestsByPath` takes exact paths, not regexes, and still honours `testPathIgnorePatterns` —
 * a staged `tests/cluster` or `tests/broker` file is dropped, `--passWithNoTests` then lets that
 * empty run pass; those suites need their own config and real services.
 * https://jestjs.io/docs/cli#--runtestsbypath
 */
const result = spawnSync(
    'npx',
    ['jest', '--runInBand', '--passWithNoTests', '--runTestsByPath', ...files],
    { cwd: REPO_ROOT, stdio: 'inherit' }
);

process.exit(result.status ?? 1);
