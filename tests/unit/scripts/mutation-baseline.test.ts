/**
 * `scripts/mutation-baseline.ts` — the per-file mutation ratchet.
 *
 * This is a GATE, so its own logic has to be right: a ratchet that silently re-records a
 * regression is worse than no ratchet, because it looks like one. The asymmetry is the whole
 * design and it is what these cases pin —
 *
 *   improvements move the baseline UP, regressions never move it DOWN.
 *
 * Driven against synthetic reports rather than a real Stryker run, for the same reason the
 * spec-identity tests use temp directories: the logic must be testable without a 51-minute
 * mutation run, and a test that needed one would never be run.
 */
import {
    SCORE_TOLERANCE,
    compareToBaseline,
    missingFromReport,
    formatRegressions,
    nextBaseline,
    scoresFromReport,
    type MutationBaseline
} from '../../../scripts/mutation-baseline';

/*
 * Fixtures are built from TUPLES rather than object literals, because the keys are file paths:
 * `'src/a.ts'` as a literal key trips the naming-convention lint rule in every fixture, and
 * disabling the rule per line would be more noise than the helper.
 */

/** A Stryker-shaped report from `[file, statuses]` pairs. */
const report = (...files: [string, string[]][]) => ({
    files: Object.fromEntries(
        files.map(([file, statuses]) => [file, { mutants: statuses.map((status) => ({ status })) }])
    )
});

/** Per-file scores from `[file, score]` pairs. */
const scores = (...files: [string, number][]): Record<string, number> => Object.fromEntries(files);

const baselineOf = (...files: [string, number][]): MutationBaseline => ({
    generatedAt: '2026-08-09T00:00:00.000Z',
    files: Object.fromEntries(files)
});

/** The one path used throughout, named so the tuples stay readable. */
const FILE = 'src/a.ts';
const OTHER = 'src/b.ts';
const NEWCOMER = 'src/new.ts';
const GONE = 'src/gone.ts';

describe('scoresFromReport', () => {
    it('scores killed mutants as a percentage of the viable ones', () => {
        expect(
            scoresFromReport(report([FILE, ['Killed', 'Killed', 'Survived', 'Survived']]))
        ).toEqual(scores([FILE, 50]));
    });

    it('counts a timeout as killed', () => {
        // Stryker's own convention: a mutant that hangs the suite HAS been detected, expensively.
        // Scoring it as a survivor would make the number depend on machine load.
        expect(scoresFromReport(report([FILE, ['Timeout', 'Killed']]))).toEqual(
            scores([FILE, 100])
        );
    });

    it('excludes non-viable mutants from the denominator entirely', () => {
        // A mutant that would not compile was never a test the suite could have passed or failed,
        // so counting it either way would misreport the file.
        expect(
            scoresFromReport(report([FILE, ['Killed', 'CompileError', 'RuntimeError', 'Ignored']]))
        ).toEqual(scores([FILE, 100]));
    });

    it('treats a file with no viable mutants as 100, not 0', () => {
        // Otherwise a file Stryker could not mutate at all would sit permanently at zero and the
        // ratchet would cry wolf forever.
        expect(scoresFromReport(report([FILE, ['CompileError']]))).toEqual(scores([FILE, 100]));
    });

    it('scores an all-survived file as 0 rather than omitting it', () => {
        // An honest zero on the record is the point — see §5.3 of the plan.
        expect(scoresFromReport(report([FILE, ['Survived', 'Survived']]))).toEqual(
            scores([FILE, 0])
        );
    });

    it('reports each file independently', () => {
        expect(
            scoresFromReport(report([FILE, ['Killed']], [OTHER, ['Survived', 'Survived']]))
        ).toEqual(scores([FILE, 100], [OTHER, 0]));
    });
});

describe('compareToBaseline', () => {
    it('fails a file that dropped further than the tolerance', () => {
        const comparisons = compareToBaseline(scores([FILE, 60]), baselineOf([FILE, 90]));

        expect(comparisons[0]?.verdict).toBe('regressed');
    });

    it('does NOT fail a drop within the tolerance', () => {
        // The tolerance is a measurement error bar for the timeout/survivor race, not slack.
        // Without it the gate fails on machine load, and a gate that fails randomly gets removed.
        const comparisons = compareToBaseline(
            scores([FILE, 90 - SCORE_TOLERANCE]),
            baselineOf([FILE, 90])
        );

        expect(comparisons[0]?.verdict).not.toBe('regressed');
    });

    it('recognises an improvement', () => {
        expect(compareToBaseline(scores([FILE, 95]), baselineOf([FILE, 90]))[0]?.verdict).toBe(
            'improved'
        );
    });

    it('recognises an unchanged file', () => {
        expect(compareToBaseline(scores([FILE, 90]), baselineOf([FILE, 90]))[0]?.verdict).toBe(
            'held'
        );
    });

    it('marks a file the baseline has never seen as new', () => {
        expect(compareToBaseline(scores([NEWCOMER, 0]), baselineOf())[0]).toEqual({
            file: NEWCOMER,
            current: 0,
            verdict: 'new'
        });
    });

    it('reports a file that left the mutate scope rather than ignoring it', () => {
        // Dropping a file out of scope is how a weak file gets "fixed". Legitimate sometimes, but
        // it belongs in the output where a reviewer can see it.
        expect(compareToBaseline(scores(), baselineOf([GONE, 40]))[0]?.verdict).toBe('removed');
    });

    it('treats every file in a first run as new when there is no baseline', () => {
        const comparisons = compareToBaseline(scores([FILE, 10], [OTHER, 90]));

        expect(comparisons.every(({ verdict }) => verdict === 'new')).toBe(true);
    });
});

describe('nextBaseline — the ratchet', () => {
    it('records an improvement', () => {
        expect(nextBaseline(scores([FILE, 95]), baselineOf([FILE, 90])).files).toEqual(
            scores([FILE, 95])
        );
    });

    it('KEEPS the higher value when a file regressed', () => {
        // The single most important case in this file. If a regression could rewrite the baseline
        // downward, `--update` would launder every drop and the ratchet would be decorative.
        expect(nextBaseline(scores([FILE, 40]), baselineOf([FILE, 90])).files).toEqual(
            scores([FILE, 90])
        );
    });

    it('records a new file at whatever it first measured, including zero', () => {
        expect(nextBaseline(scores([NEWCOMER, 0]), baselineOf()).files).toEqual(
            scores([NEWCOMER, 0])
        );
    });

    it('drops a file that is no longer mutated', () => {
        expect(nextBaseline(scores([FILE, 90]), baselineOf([GONE, 40])).files).toEqual(
            scores([FILE, 90])
        );
    });

    it('is monotonic across repeated runs', () => {
        // Apply a good run then a bad one: the baseline must end where the good run left it.
        const first = nextBaseline(scores([FILE, 90]));
        const second = nextBaseline(scores([FILE, 95]), first);
        const third = nextBaseline(scores([FILE, 20]), second);

        expect(third.files[FILE]).toBe(95);
    });

    it('stamps the time it was written', () => {
        expect(Date.parse(nextBaseline(scores([FILE, 90])).generatedAt)).not.toBeNaN();
    });
});

describe('formatRegressions', () => {
    it('says nothing when nothing regressed', () => {
        expect(
            formatRegressions(compareToBaseline(scores([FILE, 95]), baselineOf([FILE, 90])))
        ).toBe('');
    });

    it('names the file and both numbers', () => {
        const message = formatRegressions(
            compareToBaseline(scores([FILE, 40]), baselineOf([FILE, 90]))
        );

        expect(message).toContain(FILE);
        expect(message).toContain('90.00');
        expect(message).toContain('40.00');
    });

    it('tells the reader where to look and what the escape hatch is', () => {
        const message = formatRegressions(
            compareToBaseline(scores([FILE, 40]), baselineOf([FILE, 90]))
        );

        expect(message).toContain('reports/mutation/index.html');
        expect(message).toContain('test:mutation:baseline');
    });
});

describe('missingFromReport — the partial-run guard', () => {
    /*
     * `stryker run --mutate 'src/one/file.ts'` is the normal way to check one file quickly, and
     * its report contains only that file. Recording it would rebuild the baseline from those keys
     * alone and drop everything else — silently, and worse than silently: the next full run would
     * then re-record current scores as if they had always been the baseline, laundering any
     * regression that happened in between.
     *
     * Running a partial mutation is fine. RECORDING one is what has to be refused.
     */
    it('names the files a partial report left out', () => {
        expect(missingFromReport(scores([FILE, 90]), baselineOf([FILE, 90], [OTHER, 80]))).toEqual([
            OTHER
        ]);
    });

    it('says nothing when the report covers the whole baseline', () => {
        expect(
            missingFromReport(scores([FILE, 90], [OTHER, 80]), baselineOf([FILE, 90], [OTHER, 80]))
        ).toEqual([]);
    });

    it('says nothing for a report that covers MORE than the baseline', () => {
        // A widened `mutate` adds files. That is a re-baselining, not a partial run, and it must
        // not be blocked — the new file simply arrives as `new`.
        expect(
            missingFromReport(scores([FILE, 90], [NEWCOMER, 0]), baselineOf([FILE, 90]))
        ).toEqual([]);
    });

    it('says nothing when there is no baseline yet', () => {
        expect(missingFromReport(scores([FILE, 90]))).toEqual([]);
    });
});
