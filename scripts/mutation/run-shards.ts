#!/usr/bin/env tsx
/**
 * The whole mutate scope on one machine, a shard at a time — `npm run mutation:full`.
 *
 * ── WHY IT EXISTS ────────────────────────────────────────────────────────────────────────────
 * The full scope is always sharded — there is no "everything in one go" command. Stryker writes
 * no report at all when it is killed mid-run, so a single unsharded pass over hours of mutants
 * would bank nothing if interrupted. This splits the scope into bin-packed shards and runs them
 * one after another, with each finished shard's report kept on disk. Stop after two shards and two
 * are banked; come back tomorrow and it starts at the third.
 *
 * ── WHAT IT DOES NOT CHANGE ──────────────────────────────────────────────────────────────────
 * Nothing about the measurement. Same config, same ruler, same per-file ratchet. A shard narrows
 * `mutate` — which mutants are tested — and narrows nothing about the suite, so a score here is
 * the score a full run would record for that file.
 *
 * ── RECORDING ────────────────────────────────────────────────────────────────────────────────
 * The baseline is written only once every shard has a report, and only through `--merge`, which
 * never lowers a score and never drops a file it did not measure. A half-covered scope is left on
 * disk unrecorded rather than written down as if it were the whole thing.
 *
 * Usage:
 *   npm run mutation:full                  run whatever is still outstanding
 *   npm run mutation:full -- --list        print the plan and what is already recorded
 *   npm run mutation:full -- --limit=2     an evening's worth, then stop
 *   npm run mutation:full -- --only=shard-03,shard-07
 *   npm run mutation:full -- --force       re-measure shards already recorded
 *   npm run mutation:full -- --no-merge    leave the baseline alone when the scope closes
 *   npm run mutation:full -- --shard-lines=4000   fewer, bigger shards
 */
import { spawnSync } from 'node:child_process';
import { cp, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { BASELINE_PATH, REPORT_PATH } from './baseline';
import { selectShards } from './local-policy';
import { scopeWithLines } from './mutate-scope';
import { TARGET_LINES_PER_SHARD, packIntoShards } from './sharding';
import { REPO_ROOT, runStryker } from './stryker-run';

/** Where each shard's report is kept between evenings. Under `reports/`, so it is gitignored. */
const SHARD_ROOT = path.join(REPO_ROOT, 'reports', 'mutation-shards');

/** A comma-separated CLI value, e.g. `--only=shard-03,shard-07`. */
const listArgument = (flag: string): string[] =>
    process.argv
        .find((argument) => argument.startsWith(`${flag}=`))
        ?.slice(flag.length + 1)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean) ?? [];

/** A numeric CLI value, e.g. `--limit=2`. Absent or unparseable means "no cap". */
const numberArgument = (flag: string): number | undefined => {
    const raw = process.argv.find((argument) => argument.startsWith(`${flag}=`));
    const value = Number(raw?.slice(flag.length + 1));
    return Number.isInteger(value) && value > 0 ? value : undefined;
};

/** The one config — see `baseline.ts`. */
const CONFIG = 'stryker.json';

/**
 * Lines per shard. Bigger shards mean fewer whole-suite dry runs — that cost is per shard, not per
 * mutant — at the price of a longer stretch before the next piece of credit is banked.
 */
const shardLines = numberArgument('--shard-lines') ?? TARGET_LINES_PER_SHARD;

/**
 * Where this sweep's shard reports live — the directory `--merge-dir` is later pointed at.
 *
 * Keyed by shard size: change the size and every shard's name and contents change with it, so a
 * sweep at one size must not fold a sweep at another size's reports into itself.
 */
const reportRoot = path.join(SHARD_ROOT, String(shardLines));

/** The shards, bin-packed by line count — the same plan `shard-plan.ts` hands the weekly matrix. */
const shards = packIntoShards(scopeWithLines(), shardLines);

/** A shard is recorded when its copied report exists; that file is the unit of banked credit. */
const shardReport = (name: string): string => path.join(reportRoot, name, 'mutation.json');
const completed = shards.map(({ name }) => name).filter((name) => existsSync(shardReport(name)));

/** What this invocation will actually run, after `--only`, `--limit` and `--force`. */
const { run, done } = selectShards(shards, {
    completed,
    only: listArgument('--only'),
    limit: numberArgument('--limit'),
    force: process.argv.includes('--force')
});

/** Minutes and seconds, for a log line that spans hours. */
const elapsed = (since: number): string => {
    const seconds = Math.round((Date.now() - since) / 1000);
    return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`;
};

/** Prints the plan without running anything — `--list`. */
const printPlan = (): void => {
    console.log(`[shards] ${shards.length} shards of ~${shardLines} lines, ${CONFIG}`);
    for (const shard of shards) {
        const state = completed.includes(shard.name) ? 'recorded' : 'outstanding';
        const files = shard.mutate.split(',').length;
        console.log(
            `  ${shard.name}  ${String(shard.lines).padStart(5)} lines  ` +
                `${String(files).padStart(3)} files  ${state}`
        );
    }
};

/**
 * Runs one shard and banks its report.
 *
 * Success is "a report appeared", not "Stryker exited 0": `thresholds.break` fires on the average
 * over whatever files this shard happens to hold, and the size of a shard is not a fact about the
 * code — the per-file ratchet at the end is the verdict.
 *
 * @returns whether this shard left a report behind
 */
const runShard = async (name: string, mutate: string, index: number): Promise<boolean> => {
    const startedAt = Date.now();
    const destination = path.join(reportRoot, name);

    await runStryker({
        label: `${name} (${index + 1}/${run.length})`,
        args: [
            CONFIG,
            '--mutate',
            mutate,
            // One incremental cache per shard: a shared one would have each shard discard the
            // previous shard's memory, which is why `mutation.yml` keys its cache per matrix job.
            '--incrementalFile',
            path.join(path.relative(REPO_ROOT, reportRoot), name, 'incremental.json'),
            ...(process.argv.includes('--force') ? ['--force'] : [])
        ]
    });

    const produced = path.join(REPO_ROOT, REPORT_PATH);
    const written = await stat(produced).catch(() => undefined);
    if (!written || written.mtimeMs < startedAt) {
        console.error(
            `[shards] ${name} produced no report after ${elapsed(startedAt)} — not banked.`
        );
        return false;
    }

    await mkdir(destination, { recursive: true });
    await cp(path.dirname(produced), destination, { recursive: true });
    console.log(
        `[shards] ${name} banked in ${elapsed(startedAt)} -> ${path.relative(REPO_ROOT, destination)}`
    );
    return true;
};

/**
 * Folds every shard into the per-file ratchet, once the whole scope is covered.
 *
 * `--merge`, never `--update`: the latter treats the report as the entire scope and would drop
 * every file it does not mention. See `scripts/mutation/baseline.ts`.
 *
 * @returns the check's exit code — non-zero means a file scored below what the baseline records
 */
const mergeAll = (): number => {
    const check = spawnSync(
        'npx',
        [
            'tsx',
            'scripts/mutation/check-baseline.ts',
            '--merge',
            `--merge-dir=${path.relative(REPO_ROOT, reportRoot)}`
        ],
        { cwd: REPO_ROOT, stdio: 'inherit' }
    );
    return check.status ?? 2;
};

const main = async (): Promise<number> => {
    if (process.argv.includes('--list')) {
        printPlan();
        return 0;
    }

    console.log(
        `[shards] ${shards.length} shards, ${done.length} already recorded, ` +
            `${run.length} to run now.`
    );
    if (run.length === 0 && done.length === 0) {
        console.error('[shards] nothing selected — check --only against `--list`.');
        return 2;
    }

    const banked: string[] = [];
    for (const [index, shard] of run.entries()) {
        const ok = await runShard(shard.name, shard.mutate, index);
        if (ok) banked.push(shard.name);
    }

    const recorded = shards.filter(({ name }) => existsSync(shardReport(name)));
    console.log(`[shards] ${recorded.length}/${shards.length} shards now have a report.`);

    if (recorded.length < shards.length) {
        console.log(
            `[shards] scope not closed yet — the baseline is left alone. ` +
                `Run this again to continue; reports are kept under ${path.relative(REPO_ROOT, reportRoot)}.`
        );
        return banked.length === run.length ? 0 : 1;
    }

    if (process.argv.includes('--no-merge')) {
        console.log(`[shards] scope complete. --no-merge given, so ${BASELINE_PATH} is untouched.`);
        return 0;
    }

    console.log(`[shards] scope complete — folding every shard into ${BASELINE_PATH}.`);
    return mergeAll();
};

void main().then((code) => process.exit(code));
