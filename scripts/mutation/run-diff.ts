#!/usr/bin/env tsx
/**
 * Mutation testing scoped to the files a branch changed — `npm run mutation`.
 *
 * Same Stryker run as `mutation:full`, with `--mutate` narrowed to the changed files (whole
 * files, not lines), then the ordinary per-file ratchet (`scripts/mutation/check-baseline.ts`).
 * It never records: `--update` is not forwarded, so a partial report cannot erase the baseline.
 *
 * Graded on its own files, then laid over the report already on disk (`overlayReport`), so a
 * pulled sweep stays whole with this branch's files refreshed.
 *
 * Why whole files, why it cannot fail you for old debt:
 * docs/tools/mutation-testing.md#the-diff-run-and-why-it-can-fail-when-the-full-sweep-cannot
 *
 * Usage:
 *   npm run mutation                 # against origin/main
 *   npm run mutation -- --base=HEAD~3
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { REPORT_PATH } from './baseline';
import { overlayReport, renderHtml, type StrykerReport } from './ci/merge';
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

/** The report Stryker writes. */
const reportFile = path.join(REPO_ROOT, REPORT_PATH);

/** Stryker's HTML page, beside the report. */
const pageFile = path.join(path.dirname(reportFile), 'index.html');

/** Reads a Stryker JSON report. */
const readStrykerReport = (file: string): StrykerReport =>
    JSON.parse(readFileSync(file, 'utf8')) as StrykerReport;

/** The report on disk before this run — a pulled sweep's, or an earlier run's — and when it was written. */
const previous = existsSync(reportFile)
    ? { report: readStrykerReport(reportFile), writtenAt: statSync(reportFile).mtimeMs }
    : undefined;

/**
 * Lays this run's report over the one that was on disk, and redraws the page from the result.
 *
 * Skipped when there was none (a fresh checkout, CI), or when Stryker wrote no new report.
 */
const keepReportWhole = (): void => {
    if (!previous || statSync(reportFile).mtimeMs === previous.writtenAt) return;

    const merged = overlayReport(previous.report, readStrykerReport(reportFile));
    writeFileSync(reportFile, JSON.stringify(merged));
    writeFileSync(pageFile, renderHtml(readFileSync(pageFile, 'utf8'), merged));
    console.log(
        `[mutation-diff] ${REPORT_PATH}: ${files.length} file(s) refreshed, ` +
            `${Object.keys(merged.files).length} in the report.`
    );
};

/*
 * Through `runStryker`, not a bare `npx stryker`: this run needs the same per-worker heap cap and
 * concurrency as every other entry point. Calling Stryker directly is how it silently ran without
 * them — docs/tools/mutation-testing.md#worker-heap-cap.
 */
void runStryker({
    label: `diff (${files.length} files)`,
    args: ['stryker.json', '--mutate', files.join(','), '--force']
}).then(({ abortedForOom }) => {
    if (abortedForOom) process.exit(1);
    // Graded before the overlay, so the verdict judges this branch's files alone.
    const verdict = grade();
    keepReportWhole();
    process.exit(verdict);
});
