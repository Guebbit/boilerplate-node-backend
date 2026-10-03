#!/usr/bin/env tsx
/**
 * The GitHub sweep's command line. Every step in `mutation.yml` and `mutation-wave.yml` calls one
 * subcommand; the logic lives in the pure modules beside this file.
 *
 *   config                                          write tmp/stryker.ci.json
 *   wave --wave=1 --out=<plan.json>                 plan the first wave from the real scope
 *   wave --wave=<n> --previous=<plan.json> --outcomes=<dir> --out=<plan.json>
 *   shard --plan=<plan.json> --name=<shard>         the shard's --mutate list and MUTATION_SLICE
 *   outcome --name=<shard> --exit=<code> --out=<dir>
 *   merge --reports=<dir> --plans=<dir> --out=<dir>
 *
 * `key=value` lines on stdout are for `>> "$GITHUB_OUTPUT"`; everything for a human goes to stderr.
 *
 * CI only: nothing here is used by `npm run mutation:full`, which keeps its own `stryker.json` run.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { REPORT_PATH, scoresFromReport } from '../baseline';
import { lineCount, mutableFiles } from '../mutate-scope';
import type { ShardReport, StrykerReport } from './merge';
import { formatSummary, mergeReports, renderHtml } from './merge';
import type { ShardOutcome, WavePlan } from './waves';
import { firstWave, nextWave, outcomeOf, strykerArguments } from './waves';

/** Where `config` writes: under `tmp/`, so it is gitignored and outside Stryker's sandbox copy. */
const CI_CONFIG_PATH = 'tmp/stryker.ci.json';

/** The slicing plugin, as `appendPlugins` wants it — relative to the repo root Stryker runs in. */
const SLICE_PLUGIN = './scripts/mutation/ci/slice-ignorer.ts';

/** How many of the lowest-scoring files the run summary lists. */
const WEAKEST_SHOWN = 15;

/**
 * A `--name=value` argument.
 *
 * @throws {Error} when it is missing — every subcommand's arguments are required
 */
const option = (name: string): string => {
    const value = process.argv
        .find((argument) => argument.startsWith(`--${name}=`))
        ?.slice(name.length + 3);
    if (value === undefined) throw new Error(`missing --${name}=…`);
    return value;
};

/**
 * Reads a JSON file. Every caller casts the result: each file read here was written by this same
 * pipeline or by Stryker's JSON reporter, so its shape is ours to trust, not to re-validate.
 */
const readJson = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));

/** Writes a file, making its directory first. */
const writeOut = (file: string, content: string): void => {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
};

/** A `key=value` line for `$GITHUB_OUTPUT`. */
const output = (key: string, value: string | number): void => {
    console.log(`${key}=${value}`);
};

/**
 * `stryker.json` plus the slicing plugin — and nothing else, so the CI sweep measures with the same
 * ruler as a local run. Written fresh each job: derived, never committed, so it cannot drift.
 */
const writeConfig = (): void => {
    const base = readJson('stryker.json') as { appendPlugins?: string[]; ignorers?: string[] };
    writeOut(
        CI_CONFIG_PATH,
        JSON.stringify(
            {
                ...base,
                appendPlugins: [...(base.appendPlugins ?? []), SLICE_PLUGIN],
                ignorers: [...(base.ignorers ?? []), 'ci-slice']
            },
            undefined,
            4
        )
    );
    console.error(`[mutation-ci] wrote ${CI_CONFIG_PATH}`);
};

/** The mutate scope with both line counts the planner needs. */
const scope = () =>
    mutableFiles().map((file) => ({
        file,
        lines: lineCount(file),
        physicalLines: readFileSync(file, 'utf8').split('\n').length
    }));

/** Every outcome file under a directory, by shard name. */
const readOutcomes = (directory: string): Map<string, ShardOutcome> =>
    new Map(
        existsSync(directory)
            ? readdirSync(directory)
                  .filter((file) => file.endsWith('.json'))
                  .map((file) => {
                      const { name, status } = readJson(path.join(directory, file)) as {
                          name: string;
                          status: ShardOutcome;
                      };
                      return [name, status] as const;
                  })
            : []
    );

/** Plans one wave and prints its shard names for the matrix. */
const planWave = (): void => {
    const wave = Number(option('wave'));
    const plan =
        wave === 1
            ? firstWave(scope())
            : nextWave(readJson(option('previous')) as WavePlan, readOutcomes(option('outcomes')));

    writeOut(option('out'), JSON.stringify(plan));
    console.error(
        `[mutation-ci] wave ${plan.wave}: ${plan.shards.length} shards, ` +
            `${plan.backlog.length} in backlog, ${plan.abandoned.length} given up on so far`
    );
    output('shards', JSON.stringify(plan.shards.map(({ name }) => name)));
    output('count', plan.shards.length);
};

/** Prints one shard's Stryker arguments. */
const showShard = (): void => {
    const name = option('name');
    const shard = (readJson(option('plan')) as WavePlan).shards.find((each) => each.name === name);
    if (!shard) throw new Error(`no shard ${name} in this wave's plan`);

    const { mutate, slice } = strykerArguments(shard);
    console.error(`[mutation-ci] ${name}: ${mutate}${slice ? ` lines ${slice}` : ''}`);
    output('mutate', mutate);
    output('slice', slice);
};

/** Records how a shard's job ended, for the next wave's planner. */
const recordOutcome = (): void => {
    const name = option('name');
    const status = outcomeOf(Number(option('exit')), existsSync(REPORT_PATH));
    writeOut(path.join(option('out'), `${name}.json`), JSON.stringify({ name, status }));
    console.error(`[mutation-ci] ${name}: ${status}`);
    output('status', status);
};

/** Every finished shard's report, paired with its plan entry, in shard-name order. */
const readFinished = (reportsDirectory: string, plans: readonly WavePlan[]): ShardReport[] => {
    const shards = new Map(
        plans.flatMap(({ shards: each }) => each.map((shard) => [shard.name, shard]))
    );

    return (existsSync(reportsDirectory) ? readdirSync(reportsDirectory) : [])
        .toSorted()
        .flatMap((directory) => {
            const shard = shards.get(directory.replace(/^shard-/, ''));
            const file = path.join(reportsDirectory, directory, 'mutation.json');
            return shard && existsSync(file)
                ? [{ shard, report: readJson(file) as StrykerReport }]
                : [];
        });
};

/** Merges every finished shard into one report, page and summary under `--out`. */
const merge = (): void => {
    const plansDirectory = option('plans');
    const plans = readdirSync(plansDirectory)
        .filter((file) => file.endsWith('.json'))
        .map((file) => readJson(path.join(plansDirectory, file)) as WavePlan)
        .toSorted((a, b) => a.wave - b.wave);
    const last = plans.at(-1);
    if (!last) throw new Error(`no wave plans under ${plansDirectory}`);

    const reportsDirectory = option('reports');
    const finished = readFinished(reportsDirectory, plans);
    const { report, incomplete } = mergeReports(finished, last.scope);
    const out = option('out');

    writeOut(path.join(out, 'mutation.json'), JSON.stringify(report));
    if (finished.length > 0) {
        const template = readFileSync(
            path.join(reportsDirectory, `shard-${finished[0].shard.name}`, 'index.html'),
            'utf8'
        );
        writeOut(path.join(out, 'index.html'), renderHtml(template, report));
    }

    const weakest = Object.entries(scoresFromReport(report))
        .toSorted(([, a], [, b]) => a - b)
        .slice(0, WEAKEST_SHOWN);
    writeOut(path.join(out, 'summary.md'), formatSummary({ report, incomplete, weakest }));

    console.error(
        `[mutation-ci] merged ${finished.length} shard reports: ` +
            `${Object.keys(report.files).length} files scored, ${incomplete.length} not measured`
    );
    output('incomplete', incomplete.length);
};

/** Subcommand name → handler. */
const commands: Partial<Record<string, () => void>> = {
    config: writeConfig,
    wave: planWave,
    shard: showShard,
    outcome: recordOutcome,
    merge
};

/** The handler for the subcommand named on the command line, if there is one. */
const command = commands[process.argv[2] ?? ''];

// Exit 2 (usage error) on an unknown or missing subcommand.
if (!command) {
    console.error(`usage: cli.ts <${Object.keys(commands).join('|')}> [--options]`);
    process.exit(2);
}

// Run the chosen subcommand.
command();
