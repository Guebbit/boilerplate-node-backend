/**
 * The per-file mutation ratchet.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Stryker's `thresholds` are GLOBAL — `high`, `low`, `break`, and nothing else. There is no
 * per-file threshold. So a single `break` over a whole `mutate` scope has exactly the failure mode
 * that directory-shaped coverage thresholds have one level down: a strong file carries a weak one,
 * and the number that passes the gate is an average nobody can act on.
 *
 * That matters most precisely when `mutate` is widened to cover everything, which is the direction
 * this repo is going. A wider scope makes the pooled average LESS informative, not more.
 *
 * ── What it does ─────────────────────────────────────────────────────────────
 * A ratchet, not a wall. `mutation-baseline.json` records what each file scored on a real run.
 * Afterwards:
 *
 *   - a file that DROPS below its recorded score fails the check;
 *   - a file that IMPROVES has its baseline rewritten upward (`--update`), so the gain is locked
 *     in and cannot silently be given back;
 *   - a NEW file is recorded at whatever it first measures, with an explicit entry — including
 *     `0`. An honest zero on the record beats a zero hidden in an average, and it means a file
 *     arriving untested is visible in a diff rather than absorbed by the pool.
 *
 * Nothing here ever lowers a baseline on its own. Lowering one is a decision a person makes, in a
 * commit, with a reason — which is the same rule the `break` threshold already carries.
 *
 * ── The tolerance ────────────────────────────────────────────────────────────
 * `SCORE_TOLERANCE` is not slack, it is a measurement error bar. Some mutants HANG rather than
 * fail, and whether Stryker records one as a timeout (counted as killed) or as a survivor depends
 * on how loaded the machine is — `stryker.config.json` documents this for `plugins/http/index.ts`
 * in the frontend. Without a tolerance the ratchet would fail on machine load, and a gate that
 * fails randomly gets switched off. It is deliberately small: a real regression moves a file by
 * far more than a rounding of the timeout race.
 *
 * ── Re-baselining ────────────────────────────────────────────────────────────
 * When `mutate` changes, the POPULATION changes, and old and new numbers are not measurements of
 * the same thing. `--update` in the same commit as the `mutate` change is the sanctioned way to
 * re-record; at any other time an unexplained baseline rewrite should be questioned in review.
 *
 * The frontend mirrors this file.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Where `stryker.config.json`'s `jsonReporter` writes, and where the baseline is committed. */
export const MUTATION_REPORT_PATH = 'reports/mutation/mutation.json';
export const MUTATION_BASELINE_PATH = 'mutation-baseline.json';

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

export const readReport = (root = process.cwd()): Record<string, number> => {
    const reportPath = path.join(root, MUTATION_REPORT_PATH);
    if (!existsSync(reportPath))
        throw new Error(
            `No mutation report at ${reportPath}. Run \`npm run test:mutation\` first — ` +
                `the \`json\` reporter in stryker.config.json is what writes it.`
        );

    return scoresFromReport(JSON.parse(readFileSync(reportPath, 'utf8')) as MutationReport);
};

export const readBaseline = (root = process.cwd()): MutationBaseline | undefined => {
    const baselinePath = path.join(root, MUTATION_BASELINE_PATH);
    if (!existsSync(baselinePath)) return undefined;
    return JSON.parse(readFileSync(baselinePath, 'utf8')) as MutationBaseline;
};

export const writeBaseline = (baseline: MutationBaseline, root = process.cwd()): void => {
    writeFileSync(
        path.join(root, MUTATION_BASELINE_PATH),
        `${JSON.stringify(baseline, undefined, 4)}\n`
    );
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
 * A PARTIAL run — `stryker run --mutate 'src/one/file.ts'`, which is the normal way to check one
 * file quickly — produces a report containing only that file. Recording it would drop every other
 * file from the baseline, because `nextBaseline` builds from the report's keys. The ratchet would
 * lose its memory silently, and the next full run would re-record today's scores as if they had
 * always been the baseline, laundering any regression in between.
 *
 * So a report that is missing files the baseline knows about is refused. It is not an error to
 * RUN a partial mutation — it is only an error to record one.
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
