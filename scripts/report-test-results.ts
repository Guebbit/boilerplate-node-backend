#!/usr/bin/env tsx
/**
 * Turns a runner's JSON report into the two things a raw log cannot tell you: which MODULE a
 * failure belongs to, and where the time went — `npm run test:report`.
 *
 * SHARED SCRIPT — byte-identical in `boilerplate-node-backend` and `boilerplate-vue-frontend`,
 * and compared by `npm run check:spec-identity`. It can be, because Vitest's `json` reporter emits
 * the same shape Jest's `--json` does: a `testResults[]` of files, each with `assertionResults[]`.
 * Verified rather than assumed — both were run and their keys diffed before this was written.
 *
 * ── Why JSON and not JUnit ───────────────────────────────────────────────────────────────────
 * JUnit is the format CI dashboards read, and it would need `jest-junit` as a dependency on the
 * backend (Jest has no built-in emitter; Vitest does). JSON needs nothing on either side and
 * carries strictly more — per-assertion durations, ancestor titles, full failure messages. So the
 * artefact is JSON, and this file is the reader.
 *
 * If PR-line annotations are ever wanted, that is the moment to ADD a JUnit reporter alongside
 * this one, not to replace it: they answer different questions and the JSON is what this reads.
 *
 * ── Why per-module ───────────────────────────────────────────────────────────────────────────
 * Every other instrument in these repos is layer-shaped — `test:unit`, `test:contract`, the CI
 * jobs, the coverage globs, the mutation baseline's flat file list. That is the right shape for
 * running things and the wrong shape for reading them: the codebase is organised so that a module
 * is deletable, and nothing in the toolchain could tell you what a module's tests cost, or which
 * module owned a red build. This bucket-by-path is the cheapest possible fix, and it needs no
 * change to how anything is run.
 *
 * Usage:
 *   npm run test:report                 # read the default report path
 *   npm run test:report -- <file.json>  # read a specific one
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/*
 * `process.cwd()`, not `__dirname`: this file is byte-identical in a CommonJS repo and an ESM one,
 * and `__dirname` does not exist in the second. `import.meta.url` is the mirror-image problem. The
 * cwd is the package root for anything started by `npm run`, which is the only way this is
 * invoked — the same trade `scripts/mutation-baseline.ts` already makes.
 */
const REPO_ROOT = process.cwd();

/** Where the `test:*:report` scripts write. Overridable so a shard or a CI matrix can keep its own. */
const DEFAULT_REPORT = path.join(REPO_ROOT, 'reports', 'test-report.json');

/** How many rows the "slowest" sections print. Enough to act on, short enough to read. */
const SLOWEST = 8;

/** One test file, in the shape both runners emit. */
interface SuiteResult {
    name: string;
    status?: string;
    startTime?: number;
    endTime?: number;
    assertionResults: {
        fullName?: string;
        title: string;
        status: string;
        duration?: number | null;
        failureMessages?: string[];
    }[];
}

interface Report {
    numTotalTests?: number;
    numPassedTests?: number;
    numFailedTests?: number;
    numPendingTests?: number;
    testResults: SuiteResult[];
}

/**
 * Which module a test file belongs to, from its path alone.
 *
 * Both repos put a domain's specs under `src/modules/<name>/tests/`, so the name is already in the
 * path and nothing has to be registered, listed or kept in step. Everything else — the shared
 * suites under `tests/` — is bucketed by its LAYER instead, because that is genuinely what those
 * files are: `tests/integration/` belongs to no domain and pretending otherwise would invent an
 * owner for it.
 *
 * @param file - absolute or repo-relative path to a test file
 * @returns the bucket label
 */
const bucketOf = (file: string): string => {
    const relative = path.relative(REPO_ROOT, file).replaceAll('\\', '/');

    const module = /^src\/modules\/([^/]+)\//.exec(relative);
    if (module) return module[1];

    const layer = /^tests\/([^/]+)\//.exec(relative);
    if (layer) return `(${layer[1]})`;

    /*
     * Source that belongs to no module — `src/app`, `src/infrastructure`, `src/ui`. Bucketed by
     * its top-level area for the same reason the shared suites are bucketed by layer: it has no
     * module to attribute it to, and one `(other)` row holding a third of the codebase answers
     * nothing.
     */
    const area = /^src\/([^/]+)\//.exec(relative);
    if (area) return `(${area[1]})`;

    return '(other)';
};

const seconds = (milliseconds: number) => `${(milliseconds / 1000).toFixed(1)}s`;

const readReport = (file: string): Report => {
    if (!existsSync(file)) {
        console.error(
            `[test-report] no report at ${path.relative(REPO_ROOT, file)}.\n` +
                `  Produce one with a *:report script, e.g. npm run test:unit:report.`
        );
        process.exit(2);
    }
    return JSON.parse(readFileSync(file, 'utf8')) as Report;
};

const reportFile = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : DEFAULT_REPORT;
const report = readReport(reportFile);

/* ── Roll the flat file list up by module ───────────────────────────────────────────────────── */

interface Bucket {
    suites: number;
    tests: number;
    failed: number;
    milliseconds: number;
}

const buckets = new Map<string, Bucket>();

for (const suite of report.testResults) {
    const key = bucketOf(suite.name);
    const bucket = buckets.get(key) ?? { suites: 0, tests: 0, failed: 0, milliseconds: 0 };

    bucket.suites += 1;
    bucket.tests += suite.assertionResults.length;
    bucket.failed += suite.assertionResults.filter(({ status }) => status === 'failed').length;
    // A suite that crashed on import has no timings; treat it as instant rather than as NaN.
    bucket.milliseconds += (suite.endTime ?? 0) - (suite.startTime ?? 0);

    buckets.set(key, bucket);
}

/*
 * Modules first and alphabetically, then the layer buckets. A parenthesised label sorts before a
 * letter in ASCII, which would put `(integration)` above `account` — the opposite of useful, since
 * the modules are what someone is looking for.
 */
const isLayer = (label: string) => label.startsWith('(');
const rows = [...buckets.entries()].toSorted(([a], [b]) =>
    isLayer(a) === isLayer(b) ? a.localeCompare(b) : isLayer(a) ? 1 : -1
);

const total = report.numTotalTests ?? 0;
const failed = report.numFailedTests ?? 0;
const wall = report.testResults.reduce(
    (sum, suite) => sum + ((suite.endTime ?? 0) - (suite.startTime ?? 0)),
    0
);

console.log(
    `\n[test-report] ${total} tests in ${report.testResults.length} suites — ` +
        `${report.numPassedTests ?? 0} passed, ${failed} failed` +
        (report.numPendingTests ? `, ${report.numPendingTests} pending` : '') +
        ` (${seconds(wall)} of suite time)\n`
);

const width = Math.max(...rows.map(([label]) => label.length), 'module'.length);
console.log(`  ${'module'.padEnd(width)}  suites  tests  failed     time`);
for (const [label, bucket] of rows)
    console.log(
        `  ${label.padEnd(width)}  ${String(bucket.suites).padStart(6)}  ` +
            `${String(bucket.tests).padStart(5)}  ${String(bucket.failed).padStart(6)}  ` +
            seconds(bucket.milliseconds).padStart(7)
    );

/* ── Where the time went ────────────────────────────────────────────────────────────────────── */

const slowestSuites = report.testResults
    .map((suite) => ({
        file: path.relative(REPO_ROOT, suite.name),
        milliseconds: (suite.endTime ?? 0) - (suite.startTime ?? 0)
    }))
    .toSorted((a, b) => b.milliseconds - a.milliseconds)
    .slice(0, SLOWEST);

console.log(`\n  slowest suites`);
for (const { file, milliseconds } of slowestSuites)
    console.log(`  ${seconds(milliseconds).padStart(8)}  ${file}`);

const slowestTests = report.testResults
    .flatMap((suite) =>
        suite.assertionResults.map((assertion) => ({
            name: assertion.fullName ?? assertion.title,
            bucket: bucketOf(suite.name),
            milliseconds: assertion.duration ?? 0
        }))
    )
    .toSorted((a, b) => b.milliseconds - a.milliseconds)
    .slice(0, SLOWEST);

console.log(`\n  slowest tests`);
for (const { name, bucket, milliseconds } of slowestTests)
    console.log(`  ${seconds(milliseconds).padStart(8)}  [${bucket}] ${name}`);

/* ── Failures, named by module ──────────────────────────────────────────────────────────────── */

const failures = report.testResults.flatMap((suite) =>
    suite.assertionResults
        .filter(({ status }) => status === 'failed')
        .map((assertion) => ({
            bucket: bucketOf(suite.name),
            file: path.relative(REPO_ROOT, suite.name),
            name: assertion.fullName ?? assertion.title,
            // First line only: the whole stack is in the runner's own output, and this is an index.
            reason: (assertion.failureMessages?.[0] ?? '').split('\n')[0]
        }))
);

if (failures.length > 0) {
    console.log(`\n  failures`);
    for (const failure of failures) {
        console.log(`  ✖ [${failure.bucket}] ${failure.name}`);
        console.log(`      ${failure.file}`);
        if (failure.reason) console.log(`      ${failure.reason}`);
    }
}

/* ── Coverage, bucketed the same way ────────────────────────────────────────────────────────── */

/**
 * Line coverage per module, read from `coverage/lcov.info`.
 *
 * lcov rather than a JSON coverage map because it is the one format BOTH sides emit: Jest's
 * defaults include it, and the frontend's `vitest.config.ts` names it explicitly. Parsing it is
 * four lines of string handling and no dependency — `SF:` opens a file, `LF:`/`LH:` are the lines
 * found and hit in it.
 *
 * Absent by design when a run was not a coverage run: this is the report, not the gate, and the
 * per-file floors in `jest.config.js` / `vitest.config.ts` remain the thing that fails a build. What
 * this adds is the number those floors cannot express — what a MODULE costs and what it covers —
 * because a floor is per file and a module is a directory of them.
 *
 * @param file - path to lcov.info
 * @returns hit/found line totals per bucket, or undefined when there is no report to read
 */
const readCoverage = (file: string): Map<string, { hit: number; found: number }> | undefined => {
    if (!existsSync(file)) return undefined;

    const perBucket = new Map<string, { hit: number; found: number }>();
    let bucket = '';

    for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (line.startsWith('SF:')) bucket = bucketOf(line.slice(3).trim());
        else if (line.startsWith('LF:') || line.startsWith('LH:')) {
            const entry = perBucket.get(bucket) ?? { hit: 0, found: 0 };
            if (line.startsWith('LF:')) entry.found += Number(line.slice(3));
            else entry.hit += Number(line.slice(3));
            perBucket.set(bucket, entry);
        }
    }

    return perBucket;
};

const coverage = readCoverage(path.join(REPO_ROOT, 'coverage', 'lcov.info'));

if (coverage) {
    const covered = [...coverage.entries()].toSorted(([a], [b]) =>
        isLayer(a) === isLayer(b) ? a.localeCompare(b) : isLayer(a) ? 1 : -1
    );
    const labelWidth = Math.max(...covered.map(([label]) => label.length), 'module'.length);

    console.log(`\n  line coverage (from coverage/lcov.info)`);
    console.log(`  ${'module'.padEnd(labelWidth)}   lines   covered`);
    for (const [label, { hit, found }] of covered)
        console.log(
            `  ${label.padEnd(labelWidth)}  ${String(found).padStart(6)}  ` +
                (found === 0 ? '—' : `${((hit / found) * 100).toFixed(1)}%`).padStart(8)
        );
}

/*
 * Always zero. This READS a report the runner already gated on; a second non-zero exit here would
 * either duplicate that verdict or, worse, disagree with it.
 */
console.log('');
