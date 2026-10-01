/**
 * @module
 * The GitHub sweep's planner: what each wave's matrix runs, and what a failed shard becomes next.
 *
 * Unit:   a whole file, or a line slice of one (`slice-ignorer.ts`).
 * Shard:  one matrix job — several whole files, or exactly one slice.
 * Wave:   one matrix of at most {@link MAX_SHARDS_PER_WAVE} shards. Each wave runs every shard the
 *         last one could not finish, split smaller, then the backlog.
 * Why:    the cost of a line varies ~10× between files and nothing cheap predicts it, so the plan
 *         is allowed to be wrong — a shard that runs out of time comes back as smaller pieces.
 *
 * Pure: the CLI (`cli.ts`) does the reading and writing.
 * See: docs/tools/mutation-testing.md#the-github-sweep
 */
import type { LineSlice } from './slice-ignorer';

/**
 * GitHub's cap on the jobs one matrix may generate.
 * https://docs.github.com/en/actions/reference/limits
 */
export const MAX_SHARDS_PER_WAVE = 256;

/**
 * Non-blank lines per shard, and the size a big file is sliced to.
 *
 * Measured: the 39 shards of the 2026-09-27 sweep that finished — 0.43 min per line at
 *   `--concurrency 2`, median. The 11 that timed out are heavier, so that is a floor.
 * Assumed:  one worker doubles it, so 200 lines is ~3 hours against a 330-minute budget.
 * Heavier files time out and are split; that is the design, not a failure of this number.
 */
export const SHARD_LINES = 200;

/** How many pieces a shard that ran out of time is cut into. */
export const SPLIT_FACTOR = 4;

/** A slice shorter than this is not split again — it is retried as it is, once. */
export const MIN_SLICE_LINES = 8;

/** How often the same work may fail for a reason other than time before it is given up on. */
export const MAX_ERROR_RETRIES = 1;

/** One mutable file, as the planner sizes it. */
export interface ScopeFile {
    file: string;
    /** Non-blank lines — the cost proxy. */
    lines: number;
    /** Every line, blank ones included — what a slice's line numbers index. */
    physicalLines: number;
}

/** A whole file, or a slice of one. */
export interface Unit extends ScopeFile {
    slice?: LineSlice;
}

/** One matrix job's work. */
export interface CiShard {
    /** `w<wave>-<index>`, unique across the whole run. */
    name: string;
    units: Unit[];
    /** How many times this exact work has already failed for a reason other than time. */
    errors: number;
}

/** How a shard's job ended, as its outcome artifact records it. */
export type ShardOutcome = 'reported' | 'timeout' | 'error';

/** Everything the next wave and the merge need, uploaded as each wave's plan artifact. */
export interface WavePlan {
    wave: number;
    /** The whole mutate scope, carried forward so the merge can tell a finished file. */
    scope: ScopeFile[];
    /** This wave's matrix. */
    shards: CiShard[];
    /** Planned, but past this wave's cap. */
    backlog: CiShard[];
    /** Work given up on so far, across every wave. */
    abandoned: CiShard[];
}

/** The range a unit covers: its slice, or the whole file. */
export const spanOf = (unit: Unit): LineSlice => unit.slice ?? { from: 1, to: unit.physicalLines };

/**
 * Cuts a range of a file into `parts` contiguous slices of roughly equal length.
 *
 * `lines` is shared out in proportion, so a slice's cost estimate stays comparable to a whole file's.
 */
const cut = (unit: Unit, parts: number): Unit[] => {
    const { from, to } = spanOf(unit);
    const length = to - from + 1;
    const bounds = Array.from(
        { length: parts + 1 },
        (_, index) => from + Math.round((index * length) / parts)
    );

    return Array.from({ length: parts }, (_, index) => ({
        file: unit.file,
        physicalLines: unit.physicalLines,
        lines: Math.max(1, Math.round(unit.lines / parts)),
        slice: { from: bounds[index], to: bounds[index + 1] - 1 }
    }));
};

/** A file as the first wave sees it: whole when it fits a shard, sliced when it doesn't. */
export const unitsOf = (file: ScopeFile, shardLines = SHARD_LINES): Unit[] =>
    file.lines <= shardLines ? [file] : cut(file, Math.ceil(file.lines / shardLines));

/**
 * Splits a unit that ran out of time, or `undefined` when it is already too small to split.
 *
 * @param factor how many pieces
 */
export const splitUnit = (unit: Unit, factor = SPLIT_FACTOR): Unit[] | undefined => {
    const { from, to } = spanOf(unit);
    return to - from + 1 < factor * MIN_SLICE_LINES ? undefined : cut(unit, factor);
};

/**
 * Groups units into shards: a slice alone (its `MUTATION_SLICE` covers the whole run), whole files
 * first-fit-decreasing up to `shardLines` — a hard cap, unlike `sharding.ts`'s balanced bins.
 *
 * @returns unnamed shards, slices first — they are the ones most likely to be slow
 */
export const packUnits = (units: readonly Unit[], shardLines = SHARD_LINES): Unit[][] => {
    const slices = units.filter((unit) => unit.slice).map((unit) => [unit]);
    const bins: { units: Unit[]; lines: number }[] = [];

    for (const unit of units.filter((each) => !each.slice).toSorted((a, b) => b.lines - a.lines)) {
        const bin = bins.find(({ lines }) => lines + unit.lines <= shardLines);
        if (bin) {
            bin.units.push(unit);
            bin.lines += unit.lines;
        } else bins.push({ units: [unit], lines: unit.lines });
    }

    return [...slices, ...bins.map((bin) => bin.units)];
};

/** Names a queue for one wave, caps it, and carries the rest as backlog. */
const scheduleWave = (
    wave: number,
    queue: readonly Omit<CiShard, 'name'>[],
    carried: Pick<WavePlan, 'scope' | 'abandoned'>
): WavePlan => {
    const named = queue.map((shard, index) => ({
        ...shard,
        name: `w${wave}-${String(index).padStart(3, '0')}`
    }));

    return {
        wave,
        ...carried,
        shards: named.slice(0, MAX_SHARDS_PER_WAVE),
        backlog: named.slice(MAX_SHARDS_PER_WAVE)
    };
};

/**
 * The first wave: the whole scope, big files pre-sliced.
 *
 * @param shardLines lines per shard, defaulting to {@link SHARD_LINES}
 */
export const firstWave = (scope: readonly ScopeFile[], shardLines = SHARD_LINES): WavePlan =>
    scheduleWave(
        1,
        packUnits(
            scope.flatMap((file) => unitsOf(file, shardLines)),
            shardLines
        ).map((units) => ({ units, errors: 0 })),
        { scope: [...scope], abandoned: [] }
    );

/**
 * What one shard of the previous wave turns into.
 *
 * Timeout: more files than one → one shard each; one unit → {@link SPLIT_FACTOR} slices.
 * Error, or no outcome at all (a runner lost mid-job): the same work once more, then given up.
 */
const retryOf = (
    shard: CiShard,
    outcome: ShardOutcome | undefined
): { retry: Omit<CiShard, 'name'>[]; abandon?: CiShard } => {
    if (outcome === 'reported') return { retry: [] };

    if (outcome === 'timeout' && shard.units.length > 1)
        return { retry: shard.units.map((unit) => ({ units: [unit], errors: 0 })) };

    const pieces = outcome === 'timeout' ? splitUnit(shard.units[0]) : undefined;
    if (pieces) return { retry: pieces.map((unit) => ({ units: [unit], errors: 0 })) };

    return shard.errors < MAX_ERROR_RETRIES
        ? { retry: [{ units: shard.units, errors: shard.errors + 1 }] }
        : { retry: [], abandon: shard };
};

/**
 * The wave after `previous`: its failures split or retried, then its backlog.
 *
 * @param outcomes how each of `previous.shards` ended, by shard name; a missing name is a job
 *   that never reported back at all
 */
export const nextWave = (
    previous: WavePlan,
    outcomes: ReadonlyMap<string, ShardOutcome>
): WavePlan => {
    const results = previous.shards.map((shard) => retryOf(shard, outcomes.get(shard.name)));
    const abandoned = results.flatMap(({ abandon }) => (abandon ? [abandon] : []));

    return scheduleWave(
        previous.wave + 1,
        [...results.flatMap(({ retry }) => retry), ...previous.backlog],
        { scope: previous.scope, abandoned: [...previous.abandoned, ...abandoned] }
    );
};

/**
 * How a shard's job ended.
 *
 * A report on disk wins over the exit code: Stryker writes it only after the last mutant. Exit 124
 * is `timeout`'s own "ran out of time"; 137 is its `--kill-after` follow-up.
 *
 * @param exitCode the Stryker step's exit code, as `timeout` passed it on
 * @param hasReport whether `tmp/reports/mutation/mutation.json` exists
 */
export const outcomeOf = (exitCode: number, hasReport: boolean): ShardOutcome => {
    if (hasReport) return 'reported';
    return exitCode === 124 || exitCode === 137 ? 'timeout' : 'error';
};

/** A shard as Stryker's command line wants it: the `--mutate` list and `MUTATION_SLICE`. */
export const strykerArguments = (shard: CiShard): { mutate: string; slice: string } => {
    const [first] = shard.units;
    return {
        mutate: shard.units.map(({ file }) => file).join(','),
        slice: first.slice ? `${first.slice.from}-${first.slice.to}` : ''
    };
};
