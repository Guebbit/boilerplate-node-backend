#!/usr/bin/env tsx
/**
 * Mutation testing scoped to the files a branch changed — `npm run test:mutation:diff`.
 *
 * ── WHAT IT IS ───────────────────────────────────────────────────────────────────────────────
 * The nightly measures everything and answers tomorrow. This measures only the files in the diff
 * and answers in minutes, which is the difference between a number in a report and a number a
 * reviewer can act on.
 *
 * It is the same Stryker run as `test:mutation:deep`, with `--mutate` narrowed to the changed
 * files, followed by the ordinary per-file ratchet (`check-mutation-baseline.ts --deep`). Nothing
 * about the scoring is special-cased.
 *
 * ── WHY WHOLE FILES, NOT CHANGED LINES ───────────────────────────────────────────────────────
 * Stryker can mutate a line range (`--mutate 'file.ts:10-40'`), and Google's published practice
 * mutates diffs that way. This mutates the whole file on purpose: whole-file scores are what
 * `mutation-baseline-deep.json` records, so they compare directly, whereas a line-range score is
 * comparable to nothing. The consequence is deliberate — touch a file and you own its debt not
 * getting worse.
 *
 * ── WHY IT CANNOT FAIL YOU FOR SOMEBODY ELSE'S DEBT ──────────────────────────────────────────
 * The ratchet compares each file against its RECORDED score, not against a threshold. A file that
 * was already weak stays weak without failing; only a drop below what it previously measured does.
 * This also disposes of equivalent mutants — one that cannot be killed by any test was already
 * surviving when the baseline was taken, so it is priced in and moves nothing.
 *
 * Stryker's own `thresholds.break` is bypassed for the same reason: a percentage over a handful of
 * mutants is noise. One survivor is 50% of two mutants and 10% of ten, and the diff's size is not
 * a fact about the code.
 *
 * ── NEVER RECORDS ────────────────────────────────────────────────────────────────────────────
 * `--update` is not forwarded. A partial report recorded as the baseline would erase every file the
 * run did not measure; `check-mutation-baseline.ts` refuses that explicitly, and this never asks.
 * The nightly owns the baseline.
 *
 * Usage:
 *   npm run test:mutation:diff                 # against origin/main
 *   npm run test:mutation:diff -- --base=HEAD~3
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.join(__dirname, '..', '..');

/** What a changed file must look like to be worth mutating: production TypeScript, not a spec. */
const MUTABLE = /^src\/.+\.ts$/;
const NOT_MUTABLE = /\.d\.ts$|\/tests\/|\.test\.ts$|^src\/types\//;

const baseArgument = process.argv.find((a) => a.startsWith('--base='));
const base = baseArgument ? baseArgument.slice('--base='.length) : 'origin/main';

/** The merge-base, so a stale local `main` does not widen the diff to everything since. */
const mergeBase = (): string => {
    try {
        return execFileSync('git', ['merge-base', 'HEAD', base], {
            cwd: REPO_ROOT,
            encoding: 'utf8'
        }).trim();
    } catch {
        console.error(
            `[mutation-diff] cannot resolve '${base}'. In CI, fetch it first ` +
                `(actions/checkout with fetch-depth: 0), or pass --base=<ref>.`
        );
        process.exit(2);
    }
};

const changedFiles = (): string[] =>
    execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', `${mergeBase()}...HEAD`], {
        cwd: REPO_ROOT,
        encoding: 'utf8'
    })
        .split('\n')
        .map((line) => line.trim())
        .filter((file) => MUTABLE.test(file) && !NOT_MUTABLE.test(file))
        // A file deleted later in the branch is still in the diff; Stryker cannot mutate it.
        .filter((file) => existsSync(path.join(REPO_ROOT, file)));

const files = changedFiles();

if (files.length === 0) {
    console.log('[mutation-diff] no mutable source files changed — nothing to measure.');
    process.exit(0);
}

console.log(`[mutation-diff] ${files.length} changed file(s) against ${base}:`);
for (const file of files) console.log(`  ${file}`);

const stryker = spawnSync(
    'npx',
    ['stryker', 'run', 'stryker.deep.json', '--mutate', files.join(','), '--force'],
    { cwd: REPO_ROOT, stdio: 'inherit' }
);

/*
 * A non-zero exit here is Stryker's own `thresholds.break` firing on the diff's average, which is
 * the number this script exists NOT to judge by. The ratchet below is the verdict; a crash is not.
 */
if (stryker.error) {
    console.error(`[mutation-diff] stryker failed to start: ${stryker.error.message}`);
    process.exit(2);
}

const check = spawnSync('npx', ['tsx', 'scripts/mutation/check-baseline.ts', '--deep'], {
    cwd: REPO_ROOT,
    stdio: 'inherit'
});

process.exit(check.status ?? 2);
