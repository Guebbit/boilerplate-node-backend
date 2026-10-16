#!/usr/bin/env tsx
/**
 * Mutation testing scoped to the files a branch changed — `npm run mutation`.
 *
 * Same Stryker run as `mutation:full`, with `--mutate` narrowed to the changed files (whole
 * files, not lines), then the ordinary per-file ratchet (`scripts/mutation/check-baseline.ts`).
 * It never records: `--update` is not forwarded, so a partial report cannot erase the baseline.
 *
 * Why whole files, why it cannot fail you for old debt:
 * docs/tools/mutation-testing.md#the-diff-run-and-why-it-can-fail-when-the-full-sweep-cannot
 *
 * Usage:
 *   npm run mutation                 # against origin/main
 *   npm run mutation -- --base=HEAD~3
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { runStryker } from './stryker-run';
import { changedMutable, mutableFiles } from './mutate-scope';
import { mergeBase } from '../git-base';
import { REPO_ROOT } from '../modules-on-disk';
import { flagValue } from '../cli';

/** The git ref to diff against; `origin/main` unless `--base` says otherwise. */
const base = flagValue('base') ?? 'origin/main';

/** Every file the diff touched, changed or added or renamed into — unfiltered. */
const changedFiles = (baseCommit: string): string[] =>
    execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', `${baseCommit}...HEAD`], {
        cwd: REPO_ROOT,
        encoding: 'utf8'
    })
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '');

/** The commit where this branch left `base`; `undefined` (so: skip) when git cannot tell. */
const baseCommit = mergeBase(base, 'mutation-diff');

// Nothing to compare against: exit 0 rather than block the caller.
if (baseCommit === undefined) process.exit(0);

/** The changed files that are inside the mutation scope. */
const files = changedMutable(changedFiles(baseCommit), mutableFiles());

// No mutable file changed: nothing to measure.
if (files.length === 0) {
    console.log('[mutation-diff] no mutable source files changed — nothing to measure.');
    process.exit(0);
}

// List what is about to be mutated.
console.log(`[mutation-diff] ${files.length} changed file(s) against ${base}:`);

// One line per file.
for (const file of files) console.log(`  ${file}`);

/**
 * Grade the run that just finished against the per-file ratchet.
 *
 * Stryker's own non-zero exit is ignored on purpose — it is `thresholds.break` firing on the
 * diff's average, the number this script exists NOT to judge by. The ratchet is the verdict.
 *
 * @returns the ratchet's exit code
 */
const grade = (): number => {
    const check = spawnSync('npx', ['tsx', 'scripts/mutation/check-baseline.ts'], {
        cwd: REPO_ROOT,
        stdio: 'inherit'
    });
    return check.status ?? 2;
};

/*
 * Through `runStryker`, not a bare `npx stryker`: this run needs the same per-worker heap cap and
 * concurrency as every other entry point. Calling Stryker directly is how it silently ran without
 * them — docs/tools/mutation-testing.md#worker-heap-cap.
 */
void runStryker({
    label: `diff (${files.length} files)`,
    args: ['stryker.json', '--mutate', files.join(','), '--force']
}).then(({ abortedForOom }) => process.exit(abortedForOom ? 1 : grade()));
