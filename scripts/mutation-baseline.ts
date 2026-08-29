/**
 * The per-file mutation ratchet.
 *
 * Stryker's thresholds are GLOBAL, so one `break` over a whole `mutate` scope lets a strong file
 * carry a weak one and reports an average nobody can act on. This records what each file scored on
 * a real run, then:
 *
 *   - a file that DROPS below its recorded score fails the check;
 *   - a file that IMPROVES has its baseline rewritten upward (`--update`);
 *   - a NEW file is recorded at whatever it first measures, including an explicit `0`.
 *
 * Nothing here ever lowers a baseline on its own — that is a decision a person makes, in a commit,
 * with a reason.
 *
 * `SCORE_TOLERANCE` is a measurement error bar, not slack: whether a hanging mutant is recorded as
 * a timeout or a survivor depends on machine load, and a gate that fails randomly gets switched
 * off. Deliberately small — a real regression moves a file by far more.
 *
 * The frontend mirrors this file.
 *
 * See: docs/tools/mutation-testing.md#the-per-file-ratchet
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * One measured scope: where its Stryker report lands, and where its committed ratchet lives.
 *
 * Two scopes exist because two rulers exist, and a score is only comparable to one taken the same
 * way. `unit` is `stryker.config.json` — the unit suites, fast, the nightly's default. `deep` is
 * `stryker.deep.json`, which also runs `tests/integration/` and so is the only ruler that can see
 * the service and repository layers at all. Comparing one against the other's baseline reads every
 * integration-covered file as a mass improvement and then defends the wrong number forever.
 */
export interface MutationProfile {
    /** Where that config's `jsonReporter` writes. */
    report: string;
    /** Where its per-file ratchet is committed. */
    baseline: string;
}

export const MUTATION_PROFILES = {
    unit: {
        report: 'reports/mutation/mutation.json',
        baseline: 'mutation-baseline.json'
    },
    deep: {
        report: 'reports/mutation-deep/mutation.json',
        baseline: 'mutation-baseline-deep.json'
    }
} as const satisfies Record<string, MutationProfile>;

export type MutationProfileName = keyof typeof MUTATION_PROFILES;

/** The scope named on the command line, defaulting to the fast one. */
export const profileFromArguments = (argv: readonly string[]): MutationProfileName =>
    argv.includes('--deep') ? 'deep' : 'unit';

/**
 * How far a file may fall below its baseline before it counts as a regression.
 *
 * See the header: this absorbs the timeout/survivor race, not genuine weakening.
 */
export const SCORE_TOLERANCE = 1;

/** The subset of Stryker's JSON report this reads. */
interface MutationReport {
    files: Record<string, { mutants: { status: string }[] }>;
}

export interface MutationBaseline {
    /** When the baseline was last written, so a stale one is visible. */
    generatedAt: string;
    /** Per-file mutation score, as a percentage of mutants killed. */
    files: Record<string, number>;
}

export type FileVerdict = 'held' | 'improved' | 'regressed' | 'new' | 'removed';

export interface FileComparison {
    file: string;
    baseline?: number;
    current?: number;
    verdict: FileVerdict;
}

/**
 * Statuses that count as the tests having NOTICED the mutant.
 *
 * `Timeout` counts as killed, which is Stryker's own convention: a mutant that makes the suite
 * hang has been detected, just expensively. `RuntimeError` and `CompileError` mean the mutant was
 * never viable, so it is excluded from the denominator entirely rather than scored either way —
 * the same thing `mutationScore` does.
 */
const KILLED = new Set(['Killed', 'Timeout']);
const NOT_VIABLE = new Set(['RuntimeError', 'CompileError', 'Ignored']);

/** Per-file score from a Stryker JSON report, as a percentage with two decimals. */
export const scoresFromReport = (report: MutationReport): Record<string, number> => {
    const scores: Record<string, number> = {};

    for (const [file, { mutants }] of Object.entries(report.files)) {
        const scored = mutants.filter(({ status }) => !NOT_VIABLE.has(status));
        // A file whose every mutant was non-viable has no score to record. Treated as 100 rather
        // than 0: there was nothing for the tests to catch, so calling it untested would be a
        // permanent false alarm on the ratchet.
        if (scored.length === 0) {
            scores[file] = 100;
            continue;
        }
        const killed = scored.filter(({ status }) => KILLED.has(status)).length;
        scores[file] = Math.round((killed / scored.length) * 10_000) / 100;
    }

    return scores;
};

export const readReport = (
    profile: MutationProfile,
    root = process.cwd()
): Record<string, number> => {
    const reportPath = path.join(root, profile.report);
    if (!existsSync(reportPath))
        throw new Error(
            `No mutation report at ${reportPath}. Run \`npm run test:mutation\` first — ` +
                `the \`json\` reporter in stryker.config.json is what writes it.`
        );

    return scoresFromReport(JSON.parse(readFileSync(reportPath, 'utf8')) as MutationReport);
};

export const readBaseline = (
    profile: MutationProfile,
    root = process.cwd()
): MutationBaseline | undefined => {
    const baselinePath = path.join(root, profile.baseline);
    if (!existsSync(baselinePath)) return undefined;
    return JSON.parse(readFileSync(baselinePath, 'utf8')) as MutationBaseline;
};

export const writeBaseline = (
    baseline: MutationBaseline,
    profile: MutationProfile,
    root = process.cwd()
): void => {
    writeFileSync(path.join(root, profile.baseline), `${JSON.stringify(baseline, undefined, 4)}\n`);
};

/**
 * Compare a run against a baseline, file by file.
 *
 * `removed` is reported rather than ignored: a file that leaves the `mutate` scope silently is
 * how a weak file gets "fixed". It is not an error — deleting code is legitimate — but it belongs
 * in the output where someone can see it.
 */
export const compareToBaseline = (
    current: Record<string, number>,
    baseline?: MutationBaseline
): FileComparison[] => {
    const previous = baseline?.files ?? {};
    const files = [...new Set([...Object.keys(previous), ...Object.keys(current)])].toSorted();

    return files.map((file) => {
        const before = previous[file] as number | undefined;
        const now = current[file] as number | undefined;

        if (before === undefined) return { file, current: now, verdict: 'new' as const };
        if (now === undefined) return { file, baseline: before, verdict: 'removed' as const };
        if (now < before - SCORE_TOLERANCE)
            return { file, baseline: before, current: now, verdict: 'regressed' as const };
        if (now > before)
            return { file, baseline: before, current: now, verdict: 'improved' as const };
        return { file, baseline: before, current: now, verdict: 'held' as const };
    });
};

/**
 * Whether a report covers enough of the baseline to be safe to record.
 *
 * A partial run (`--mutate` on one file) produces a report holding only that file, and
 * `nextBaseline` builds from the report's keys — so recording one would drop every other file and
 * the ratchet would lose its memory silently. Running a partial mutation is fine; recording one is
 * not.
 */
export const missingFromReport = (
    current: Record<string, number>,
    baseline?: MutationBaseline
): string[] =>
    Object.keys(baseline?.files ?? {})
        .filter((file) => !(file in current))
        .toSorted();

/**
 * The baseline to commit after a run.
 *
 * Scores only ever move UP: an improvement is recorded, a regression keeps the old (higher) value
 * so the file stays failing until it is genuinely fixed rather than being quietly re-baselined by
 * the next `--update`. That asymmetry is the ratchet.
 */
export const nextBaseline = (
    current: Record<string, number>,
    baseline?: MutationBaseline
): MutationBaseline => {
    const previous = baseline?.files ?? {};
    const files: Record<string, number> = {};

    for (const file of Object.keys(current).toSorted()) {
        const before = previous[file] as number | undefined;
        files[file] = before === undefined ? current[file] : Math.max(before, current[file]);
    }

    return { generatedAt: new Date().toISOString(), files };
};

/** Human-readable summary. Empty string when nothing regressed. */
export const formatRegressions = (comparisons: FileComparison[]): string => {
    const regressed = comparisons.filter(({ verdict }) => verdict === 'regressed');
    if (regressed.length === 0) return '';

    const lines = regressed.map(
        ({ file, baseline, current }) =>
            `  ${file}\n      baseline ${baseline!.toFixed(2)}%  ->  now ${current!.toFixed(2)}%`
    );

    return (
        `${regressed.length} file(s) scored below their recorded baseline:\n${lines.join('\n')}\n\n` +
        `  A drop means the tests stopped noticing something they used to notice — new code with\n` +
        `  no assertions, or an assertion weakened while refactoring. Read the HTML report at\n` +
        `  reports/mutation/index.html for the surviving mutants in these files.\n\n` +
        `  Tolerance is ${SCORE_TOLERANCE} point, which absorbs the timeout/survivor race only.\n` +
        `  If the drop is intentional (code deleted, scope changed), re-record it deliberately\n` +
        `  with \`npm run test:mutation:baseline\` in the same commit, and say why.`
    );
};
