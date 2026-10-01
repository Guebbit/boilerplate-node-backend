/**
 * @module
 * Folds every shard's Stryker report from a GitHub sweep into ONE report — one HTML page, one
 * `mutation.json` for the ratchet, one summary on the run page.
 *
 * Sliced files: each slice's report holds every mutant of the file, the others' marked
 *   {@link SLICE_IGNORE_REASON}. A mutant takes the result of whichever report actually ran it.
 * Edge nodes: a node crossing a slice edge ran in both neighbours; the first report wins.
 * Test ids: Stryker numbers them per report, so they are re-keyed by file + name + line.
 * Incomplete: a file some part of which no finished shard covered. It is left OUT of the merged
 *   report, so the ratchet records nothing for it rather than a partial score.
 *
 * See: docs/tools/mutation-testing.md#the-github-sweep
 */
import { SLICE_IGNORE_REASON } from './slice-ignorer';
import type { CiShard, ScopeFile } from './waves';
import { spanOf } from './waves';

/** A mutant as Stryker's JSON report records it; fields this does not read pass through. */
interface ReportMutant {
    id: string;
    mutatorName: string;
    replacement?: string;
    status: string;
    statusReason?: string;
    location: { start: { line: number; column: number }; end: { line: number; column: number } };
    coveredBy?: string[];
    killedBy?: string[];
    [field: string]: unknown;
}

/** A test as Stryker's JSON report records it. */
interface ReportTest {
    id: string;
    name: string;
    location?: { start: { line: number; column: number } };
    [field: string]: unknown;
}

/** The subset of Stryker's `mutation-testing-report-schema` this reads and writes. */
export interface StrykerReport {
    files: Record<string, { mutants: ReportMutant[]; [field: string]: unknown }>;
    testFiles?: Record<string, { tests: ReportTest[]; [field: string]: unknown }>;
    [field: string]: unknown;
}

/** One finished shard: its plan entry and what it reported. */
export interface ShardReport {
    shard: CiShard;
    report: StrykerReport;
}

/** The merged report, and every scope file it had to leave out. */
export interface MergeResult {
    report: StrykerReport;
    incomplete: string[];
}

/** A mutant's identity within its file — the same across every slice of it. */
const mutantKey = ({ mutatorName, replacement, location: { start, end } }: ReportMutant): string =>
    `${mutatorName}|${replacement ?? ''}|${start.line}:${start.column}-${end.line}:${end.column}`;

/** Whether another slice's report is where this mutant's real result lives. */
const skippedBySlice = ({ status, statusReason }: ReportMutant): boolean =>
    status === 'Ignored' && statusReason === SLICE_IGNORE_REASON;

/**
 * The scope files some part of which no finished shard covered.
 *
 * Judged by line ranges, not by the reports' contents: Stryker leaves a file with no mutants out
 * of its report entirely, so "absent" cannot mean "failed".
 */
export const incompleteFiles = (
    scope: readonly ScopeFile[],
    finished: readonly CiShard[]
): string[] => {
    const covered = new Map<string, { from: number; to: number }[]>();
    for (const unit of finished.flatMap(({ units }) => units))
        covered.set(unit.file, [...(covered.get(unit.file) ?? []), spanOf(unit)]);

    return scope
        .filter(({ file, physicalLines }) => {
            let reached = 0;
            for (const { from, to } of (covered.get(file) ?? []).toSorted(
                (a, b) => a.from - b.from
            )) {
                if (from > reached + 1) break;
                reached = Math.max(reached, to);
            }
            return reached < physicalLines;
        })
        .map(({ file }) => file);
};

/** Re-keys every report's tests into one list per test file, and returns each report's id map. */
const mergeTests = (
    reports: readonly StrykerReport[]
): { testFiles: NonNullable<StrykerReport['testFiles']>; idMaps: Map<string, string>[] } => {
    const testFiles: NonNullable<StrykerReport['testFiles']> = {};
    const canonical = new Map<string, string>();

    const idMaps = reports.map((report) => {
        const idMap = new Map<string, string>();
        for (const [file, { tests, ...rest }] of Object.entries(report.testFiles ?? {})) {
            testFiles[file] ??= { ...rest, tests: [] };
            for (const test of tests) {
                const key = `${file}|${test.name}|${test.location?.start.line ?? ''}`;
                let id = canonical.get(key);
                if (id === undefined) {
                    id = String(canonical.size);
                    canonical.set(key, id);
                    testFiles[file].tests.push({ ...test, id });
                }
                idMap.set(test.id, id);
            }
        }
        return idMap;
    });

    return { testFiles, idMaps };
};

/** One file's mutants across every report: what each report ran, and what any report saw at all. */
interface FileMutants {
    /** The file's own fields from the first report that had it — language, source. */
    meta: Record<string, unknown>;
    /** Mutant key → the first result a report actually ran, and which report that was. */
    ran: Map<string, { mutant: ReportMutant; index: number }>;
    /** Every mutant key any report listed, run or skipped. */
    seen: Set<string>;
}

/** Records one mutant of one report: seen always, run only when this report ran it first. */
const record = (entry: FileMutants, mutant: ReportMutant, index: number): void => {
    const key = mutantKey(mutant);
    entry.seen.add(key);
    if (!skippedBySlice(mutant) && !entry.ran.has(key)) entry.ran.set(key, { mutant, index });
};

/** Every file's mutants across the finished reports, in report order. */
const collectMutants = (finished: readonly ShardReport[]): Map<string, FileMutants> => {
    const byFile = new Map<string, FileMutants>();

    for (const [index, { report }] of finished.entries())
        for (const [file, { mutants, ...meta }] of Object.entries(report.files)) {
            const entry = byFile.get(file) ?? { meta, ran: new Map(), seen: new Set<string>() };
            byFile.set(file, entry);
            for (const mutant of mutants) record(entry, mutant, index);
        }

    return byFile;
};

/**
 * Merges finished shards into one report.
 *
 * @param finished every shard that reported, in a stable order — the first wins an edge node
 * @param scope the sweep's whole mutate scope, for {@link incompleteFiles}
 */
export const mergeReports = (
    finished: readonly ShardReport[],
    scope: readonly ScopeFile[]
): MergeResult => {
    const incomplete = new Set(
        incompleteFiles(
            scope,
            finished.map(({ shard }) => shard)
        )
    );
    const { testFiles, idMaps } = mergeTests(finished.map(({ report }) => report));
    const byFile = collectMutants(finished);

    // A mutant every slice skipped cannot happen when every slice finished; if it ever does, the
    // file's score would come from a subset, so it goes out with the incomplete ones.
    for (const [file, { ran, seen }] of byFile) if (ran.size < seen.size) incomplete.add(file);

    const remap = (index: number, ids?: string[]) => ids?.map((id) => idMaps[index].get(id) ?? id);
    let nextId = 0;
    const files = Object.fromEntries(
        [...byFile]
            .filter(([file]) => !incomplete.has(file))
            .map(([file, { meta, ran }]) => [
                file,
                {
                    ...meta,
                    mutants: [...ran.values()].map(({ mutant, index }) => ({
                        ...mutant,
                        id: String(nextId++),
                        coveredBy: remap(index, mutant.coveredBy),
                        killedBy: remap(index, mutant.killedBy)
                    }))
                }
            ])
    );

    // The first report's top level (schema version, thresholds, framework), minus its `config`,
    // which names only that shard's `--mutate` list.
    const top = Object.fromEntries(
        Object.entries(finished[0]?.report ?? {}).filter(([field]) => field !== 'config')
    );
    return {
        report: { ...top, files, testFiles },
        incomplete: [...incomplete].toSorted()
    };
};

/**
 * Stryker's own HTML page with the merged report in it — the page a shard wrote, with its
 * `app.report = …` line swapped, so the viewer is exactly the version Stryker ships.
 *
 * @param template any shard's `index.html`
 * @throws {Error} when the template has no `app.report =` line (a Stryker upgrade changed it)
 */
export const renderHtml = (template: string, report: StrykerReport): string => {
    const lines = template.split('\n');
    const at = lines.findIndex((line) => line.trimStart().startsWith('app.report = '));
    if (at === -1)
        throw new Error(
            'Stryker HTML template has no `app.report =` line — has its layout changed?'
        );

    // Stryker's own escape: a `<` inside a JSON string cannot close the surrounding <script>.
    const json = JSON.stringify(report).replaceAll('<', '<"+"');
    lines[at] = `${lines[at].slice(0, lines[at].indexOf('app.report = '))}app.report = ${json};`;
    return lines.join('\n');
};

/**
 * The run page's summary, in GitHub-flavoured Markdown.
 *
 * @param weakest per-file scores, lowest first, already cut to the rows worth showing
 */
export const formatSummary = ({
    report,
    incomplete,
    weakest
}: {
    report: StrykerReport;
    incomplete: readonly string[];
    weakest: readonly [string, number][];
}): string => {
    const { byStatus, score } = tally(report);
    const fileCount = Object.keys(report.files).length;
    const mutantCount = Object.values(byStatus).reduce((sum, count) => sum + count, 0);

    return [
        '## Mutation sweep',
        '',
        score === undefined
            ? '**No finished shard produced a score.**'
            : `**Score ${score.toFixed(2)}%** — ${mutantCount} mutants in ${fileCount} files.`,
        '',
        'Full report: download the **`mutation-report`** artifact below and open `index.html`.',
        '',
        '| Status | Mutants |',
        '| --- | ---: |',
        ...Object.entries(byStatus)
            .toSorted(([, a], [, b]) => b - a)
            .map(([status, count]) => `| ${status} | ${count} |`),
        '',
        ...(weakest.length === 0
            ? []
            : [
                  '### Weakest files',
                  '',
                  '| File | Score |',
                  '| --- | ---: |',
                  ...weakest.map(
                      ([file, fileScore]) => `| \`${file}\` | ${fileScore.toFixed(2)}% |`
                  ),
                  ''
              ]),
        ...(incomplete.length === 0
            ? []
            : [
                  `### Not measured this run (${incomplete.length})`,
                  '',
                  'Some part of each file below failed in every wave, so it has no score this run and',
                  'the baseline keeps its old one. The failed jobs are the red ones in the waves above.',
                  '',
                  ...incomplete.map((file) => `- \`${file}\``),
                  ''
              ])
    ].join('\n');
};

/** Mutant counts by status, and the score the ratchet uses (`baseline.ts`). */
export const tally = (
    report: StrykerReport
): { byStatus: Record<string, number>; score: number | undefined } => {
    const byStatus: Record<string, number> = {};
    for (const { status } of Object.values(report.files).flatMap(({ mutants }) => mutants))
        byStatus[status] = (byStatus[status] ?? 0) + 1;

    const count = (...statuses: string[]) =>
        statuses.reduce((sum, status) => sum + (byStatus[status] ?? 0), 0);
    const valid = count('Killed', 'Timeout', 'Survived', 'NoCoverage');
    return {
        byStatus,
        score: valid === 0 ? undefined : (count('Killed', 'Timeout') / valid) * 100
    };
};
