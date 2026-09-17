#!/usr/bin/env tsx
/**
 * CLI for the per-file mutation ratchet.
 *
 *   npm run test:mutation:check         compare the last run against mutation-baseline.json
 *   npm run test:mutation:baseline      record the last run (improvements only — see the module)
 *   npm run test:mutation:deep:merge -- --merge-dir=<dir>
 *                                       fold a ROTATION night's shard reports into
 *                                       mutation-baseline-deep.json, leaving files no shard
 *                                       measured tonight untouched
 *
 * Reads `reports/mutation/mutation.json` (or, with `--merge`, every `mutation.json` under
 * `--merge-dir`), written by the `json` reporter in `stryker.config.json` / `stryker.deep.json`.
 * Run the mutation tests first; this does not run Stryker itself, deliberately, so the check is
 * cheap enough to run twice and so a CI job can split the run and the gate across steps.
 *
 * Exit codes: 0 fine, 1 a file regressed, 2 no report / bad arguments.
 *
 * The frontend's copy is the same CLI without `--deep` or `--merge`, since it measures one scope
 * and runs no deep, sharded pass.
 */
import {
    compareToBaseline,
    compareMerged,
    missingFromReport,
    formatRegressions,
    nextBaseline,
    mergeIntoBaseline,
    readBaseline,
    readReport,
    readReportsUnder,
    writeBaseline,
    MUTATION_PROFILES,
    profileFromArguments
} from './baseline';

const update = process.argv.includes('--update');
const merge = process.argv.includes('--merge');
const mergeDirectoryArgument = process.argv.find((argument) => argument.startsWith('--merge-dir='));
const mergeDirectory = mergeDirectoryArgument?.slice('--merge-dir='.length);

if (merge && !mergeDirectory) {
    console.error('\n[mutation-baseline] --merge requires --merge-dir=<path>\n');
    process.exit(2);
}

const profileName = profileFromArguments(process.argv);
const profile = MUTATION_PROFILES[profileName];
const MUTATION_BASELINE_PATH = profile.baseline;
const baselineCommand = `npm run test:mutation${profileName === 'deep' ? ':deep' : ''}:baseline`;

let current: Record<string, number>;
try {
    current = merge && mergeDirectory ? readReportsUnder(mergeDirectory) : readReport(profile);
} catch (error) {
    console.error(`\n[mutation-baseline] ${(error as Error).message}\n`);
    process.exit(2);
}

const baseline = readBaseline(profile);

/*
 * A first baseline is only ever written on purpose. This used to happen on ANY invocation
 * (bare `test:mutation:check` included): a local `test:mutation:diff` run before a full run had
 * ever recorded one would silently create a partial, three-file baseline from whatever it happened
 * to touch. `reports/*` — and the baseline it would have graded against — is gitignored, so CI
 * never saw it either way; locally it was a trap. Now nothing is written without `--update` or
 * `--merge`, and a plain check against a baseline that doesn't exist yet is a no-op, not a failure —
 * there being nothing to compare against yet is not this run's fault.
 */
if (!baseline) {
    if (!update && !merge) {
        console.log(
            `[mutation-baseline] No ${MUTATION_BASELINE_PATH} yet — nothing to compare against, ` +
                `and this run passed neither --update nor --merge, so nothing is recorded. ` +
                `Create the first one deliberately with \`${baselineCommand}\` after a full run.`
        );
        process.exit(0);
    }

    console.log(
        `[mutation-baseline] No ${MUTATION_BASELINE_PATH} yet — recording ${
            Object.keys(current).length
        } file(s) as the first baseline.`
    );
    writeBaseline(nextBaseline(current), profile);
    process.exit(0);
}

if (merge) {
    const comparisons = compareMerged(current, baseline);

    for (const { file, current: score } of comparisons.filter(({ verdict }) => verdict === 'new'))
        console.log(`[mutation-baseline] new file recorded: ${file} at ${score!.toFixed(2)}%`);

    for (const { file, baseline: before, current: after } of comparisons.filter(
        ({ verdict }) => verdict === 'improved'
    ))
        console.log(
            `[mutation-baseline] improved: ${file} ${before!.toFixed(2)}% -> ${after!.toFixed(2)}%`
        );

    writeBaseline(mergeIntoBaseline(current, baseline), profile);
    console.log(
        `[mutation-baseline] ${MUTATION_BASELINE_PATH} merged: ${
            Object.keys(current).length
        } file(s) from tonight's rotation.`
    );

    const regressions = formatRegressions(comparisons);
    if (regressions) {
        console.error(`\n[mutation-baseline] ${regressions}\n`);
        process.exit(1);
    }
    process.exit(0);
}

/*
 * Guard the baseline against a PARTIAL report before anything is written. See
 * `missingFromReport`: recording one would quietly erase every file the run did not measure. A
 * rotation night's partial coverage belongs under `--merge` above, which is written for exactly
 * that case; `--update` still means "this report is the whole scope".
 */
const missing = missingFromReport(current, baseline);
if (update && missing.length > 0) {
    console.error(
        `\n[mutation-baseline] Refusing to update: this report covers ${
            Object.keys(current).length
        } file(s), but the baseline knows ${Object.keys(baseline.files).length}.\n` +
            `  ${missing.length} file(s) are absent from the report, e.g.:\n` +
            missing
                .slice(0, 5)
                .map((file) => `    ${file}`)
                .join('\n') +
            `\n\n  This looks like a partial run (\`--mutate 'some/file.ts'\`). Recording it would\n` +
            `  drop those files from the baseline and lose the ratchet's memory. Run a full\n` +
            `  \`npm run test:mutation\` before recording — a rotation night's shards belong under\n` +
            `  \`--merge\`, not \`--update\`.\n`
    );
    process.exit(1);
}

const comparisons = compareToBaseline(current, baseline);

const counts = {
    held: comparisons.filter(({ verdict }) => verdict === 'held').length,
    improved: comparisons.filter(({ verdict }) => verdict === 'improved').length,
    added: comparisons.filter(({ verdict }) => verdict === 'new').length,
    removed: comparisons.filter(({ verdict }) => verdict === 'removed').length
};

/*
 * New and improved files are printed even on a passing run. The ratchet is only trustworthy if
 * people can see it moving: a silent pass looks identical to a check that is not running.
 */
for (const { file, current: score } of comparisons.filter(({ verdict }) => verdict === 'new'))
    console.log(`[mutation-baseline] new file recorded: ${file} at ${score!.toFixed(2)}%`);

for (const { file, baseline: before, current: after } of comparisons.filter(
    ({ verdict }) => verdict === 'improved'
))
    console.log(
        `[mutation-baseline] improved: ${file} ${before!.toFixed(2)}% -> ${after!.toFixed(2)}%`
    );

for (const { file } of comparisons.filter(({ verdict }) => verdict === 'removed'))
    console.log(`[mutation-baseline] no longer mutated: ${file}`);

const regressions = formatRegressions(comparisons);

if (regressions) {
    console.error(`\n[mutation-baseline] ${regressions}\n`);
    // `--update` still rewrites the file, but `nextBaseline` keeps the higher of the two scores,
    // so a regressed file keeps its old baseline and stays failing until it is genuinely fixed.
    if (update) writeBaseline(nextBaseline(current, baseline), profile);
    process.exit(1);
}

if (update) {
    writeBaseline(nextBaseline(current, baseline), profile);
    console.log(`[mutation-baseline] ${MUTATION_BASELINE_PATH} updated.`);
}

// Reached only past the `regressions` exit above, so the regressed count is zero by construction.
console.log(
    `[mutation-baseline] ${counts.held} held, ${counts.improved} improved, ` +
        `${counts.added} new, ${counts.removed} removed, 0 regressed.`
);
