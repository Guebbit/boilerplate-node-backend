/**
 * `scripts/mutation/ci/merge.ts` — folding a GitHub sweep's shard reports into one.
 *
 * Fixtures are hand-built Stryker reports, minimal but shaped like the real thing: a sliced file's
 * report holds every mutant, the other slices' marked with the slice ignorer's reason.
 */
import type { ShardReport, StrykerReport } from '../../../../../scripts/mutation/ci/merge';
import {
    formatSummary,
    incompleteFiles,
    mergeReports,
    renderHtml,
    tally
} from '../../../../../scripts/mutation/ci/merge';
import { SLICE_IGNORE_REASON } from '../../../../../scripts/mutation/ci/slice-ignorer';
import type { CiShard, ScopeFile, Unit } from '../../../../../scripts/mutation/ci/waves';

/** The file every fixture below mutates. */
const FILE = 'src/a.ts';

/** The fixture file, 40 lines long. */
const SCOPE: ScopeFile[] = [{ file: FILE, lines: 30, physicalLines: 40 }];

/** A slice of the fixture file. */
const slice = (from: number, to: number): Unit => ({ ...SCOPE[0], slice: { from, to } });

/** A shard running the given units. */
const shard = (name: string, ...units: Unit[]): CiShard => ({ name, units, errors: 0 });

/** A mutant on `line`, with `status`; a slice-ignored one carries the ignorer's reason. */
const mutant = (id: string, line: number, status: string, coveredBy: string[] = []) => ({
    id,
    mutatorName: 'ConditionalExpression',
    replacement: 'true',
    status,
    ...(status === 'Ignored' ? { statusReason: SLICE_IGNORE_REASON } : {}),
    location: { start: { line, column: 1 }, end: { line, column: 9 } },
    coveredBy
});

/** A report of the fixture file with the given mutants, and one test file holding `[id, name]` tests. */
const report = (
    mutants: ReturnType<typeof mutant>[],
    tests: [string, string][] = []
): StrykerReport => ({
    schemaVersion: '1.0',
    config: { mutate: ['only this shard'] },
    files: { [FILE]: { language: 'typescript', source: '…', mutants } },
    testFiles: {
        'tests/a.test.ts': {
            source: '…',
            tests: tests.map(([id, name], index) => ({
                id,
                name,
                location: { start: { line: index + 1, column: 1 } }
            }))
        }
    }
});

/** The fixture file split at line 20: each half's report. */
const halves = (): ShardReport[] => [
    {
        shard: shard('w1-000', slice(1, 20)),
        report: report(
            [mutant('0', 5, 'Killed', ['0']), mutant('1', 30, 'Ignored')],
            [['0', 'kills line 5']]
        )
    },
    {
        // Stryker numbers tests per run: this `'0'` is the other half's `'1'`, a different test.
        shard: shard('w1-001', slice(21, 40)),
        report: report(
            [mutant('0', 5, 'Ignored'), mutant('1', 30, 'Survived', ['0'])],
            [['0', 'covers line 30']]
        )
    }
];

describe('incompleteFiles', () => {
    it('counts a file covered by its whole unit, or by slices in any order', () => {
        expect(incompleteFiles(SCOPE, [shard('a', SCOPE[0])])).toEqual([]);
        expect(
            incompleteFiles(SCOPE, [shard('b', slice(21, 40)), shard('a', slice(1, 20))])
        ).toEqual([]);
    });

    it('flags a file with a gap no finished shard covered', () => {
        expect(
            incompleteFiles(SCOPE, [shard('a', slice(1, 20)), shard('c', slice(25, 40))])
        ).toEqual([FILE]);
    });

    it('flags a file no finished shard touched at all', () => {
        expect(incompleteFiles(SCOPE, [])).toEqual([FILE]);
    });
});

describe('mergeReports', () => {
    it('takes each mutant from the slice that ran it, once', () => {
        const { report: merged, incomplete } = mergeReports(halves(), SCOPE);

        expect(incomplete).toEqual([]);
        expect(
            merged.files[FILE].mutants.map(({ location, status }) => [location.start.line, status])
        ).toEqual([
            [5, 'Killed'],
            [30, 'Survived']
        ]);
    });

    it('keeps the first result of an edge node both neighbours ran', () => {
        const [first, second] = halves();
        second.report.files[FILE].mutants[0] = mutant('0', 5, 'Survived');

        expect(mergeReports([first, second], SCOPE).report.files[FILE].mutants[0].status).toBe(
            'Killed'
        );
    });

    it('re-keys test ids that two reports numbered the same', () => {
        const { report: merged } = mergeReports(halves(), SCOPE);
        const { tests } = merged.testFiles!['tests/a.test.ts'];
        const [killed, survived] = merged.files[FILE].mutants;

        expect(tests).toHaveLength(2);
        expect(killed.coveredBy).not.toEqual(survived.coveredBy);
        for (const id of [...killed.coveredBy!, ...survived.coveredBy!])
            expect(tests.map((test) => test.id)).toContain(id);
    });

    it('leaves out a file part of which never finished, rather than scoring a subset', () => {
        const [first] = halves();
        const { report: merged, incomplete } = mergeReports([first], SCOPE);

        expect(incomplete).toEqual([FILE]);
        expect(merged.files).toEqual({});
    });

    it('leaves out a file whose mutant every slice skipped, even when the plan says it finished', () => {
        const [first] = halves();
        const { incomplete } = mergeReports(
            [{ ...first, shard: shard('w1-000', SCOPE[0]) }],
            SCOPE
        );

        expect(incomplete).toEqual([FILE]);
    });

    it("drops the first shard's config, which names only that shard's files", () => {
        expect(mergeReports(halves(), SCOPE).report).not.toHaveProperty('config');
    });
});

describe('renderHtml', () => {
    const template = ['<script>', '      app.report = {"old":true};', '</script>'].join('\n');

    it("swaps the report into Stryker's page, escaped the way Stryker escapes it", () => {
        const html = renderHtml(template, { files: {}, note: '</script>' });

        expect(html).toContain('      app.report = {"files":{},"note":"<"+"/script>"};');
        expect(html).not.toContain('"old"');
    });

    it('fails loudly when a Stryker upgrade changed the page', () => {
        expect(() => renderHtml('<html></html>', { files: {} })).toThrow(/app\.report/);
    });
});

describe('tally and formatSummary', () => {
    it('scores the way the ratchet does — timeouts killed, ignored left out', () => {
        const counted = tally(
            report([
                mutant('0', 1, 'Killed'),
                mutant('1', 2, 'Timeout'),
                mutant('2', 3, 'Survived'),
                mutant('3', 4, 'NoCoverage'),
                mutant('4', 5, 'Ignored')
            ])
        );

        expect(counted.score).toBe(50);
        expect(counted.byStatus).toMatchObject({ Killed: 1, Ignored: 1 });
    });

    it('lists the files it could not measure', () => {
        const summary = formatSummary({ report: { files: {} }, incomplete: [FILE], weakest: [] });

        expect(summary).toContain('No finished shard produced a score');
        expect(summary).toContain(`- \`${FILE}\``);
    });
});
