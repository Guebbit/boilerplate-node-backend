/**
 * A number published in prose is an assertion nobody runs.
 *
 * `docs/theory/` does not describe the tree in general terms. It cites files by path and services
 * by LINE COUNT, and that specificity is most of what makes the pages worth reading — "past
 * roughly 300 lines a service should split, and here are the four that are over" is an argument;
 * "some services are large" is not. The specificity is also what rots, because it is the half of
 * the prose that a refactor invalidates without touching a single word of it.
 *
 * `layers.md` said so itself, in the paragraph that prompted this file: _"a published number with
 * no guard behind it drifts from the file it describes."_ It had. Every count in the
 * over-threshold table was stale — `orders` by 86 lines, `inventory` by 44, `payments` by 35 —
 * and `products/service.ts` had crossed the threshold without being added to the table at all. A
 * reader checking one of those numbers would have found the page wrong on the only claim it made
 * that could be checked, which costs more trust than the number was ever worth.
 *
 * ── What this guards, and what it deliberately does not ───────────────────────────────────────
 * NUMBERS and PATHS. Those are mechanically checkable and they rot on someone else's commit — a
 * service grows, a controller is renamed, a module is split, and the page silently stops being
 * true. Nothing here reads the prose around them: whether "the lifecycle writes, the cancel
 * sequence and the read scopes" is a fair description of `orders/service.ts` is a judgement, and
 * a test that pretended to hold it would be asserting keyword overlap.
 *
 * ── Why it reads the markdown rather than a list ──────────────────────────────────────────────
 * Every fact below is parsed off the page at run time — the table's rows, the paths in them, the
 * controller names the endpoint sentence states. A constant here listing "the three unparsed
 * endpoints" would be a second copy of the claim, free to agree with this file while disagreeing
 * with the doc, which is the exact failure the doc already had. The page is the input; the tree
 * is the expectation.
 *
 * That cuts both ways, and it is why every suite opens with a canary. A reworded sentence or a
 * renamed column makes the sweep find nothing, and a sweep over nothing passes. The canaries
 * assert the parse hit something before anything else asserts what it hit, so a doc edit that
 * outruns this parser fails loudly here instead of quietly disabling the guard.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..', '..');
const THEORY = path.join(ROOT, 'docs', 'theory');
const MODULES_ROOT = path.join(ROOT, 'src', 'modules');

const read = (page: string): string => readFileSync(path.join(THEORY, page), 'utf8');

/** The words the pages actually count in. A page that reaches eleven can add the entry. */
const NUMBER_WORDS: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10
};

interface Table {
    header: string[];
    rows: string[][];
}

/** One markdown row's cells, outer pipes dropped and each trimmed. */
const cells = (line: string): string[] =>
    line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim());

/**
 * Every markdown table on a page: contiguous pipe-led lines whose second line is the separator.
 *
 * Discovered rather than located by heading, so moving the section this reads does not break it.
 * The separator requirement is what keeps a mermaid label or a prose line containing a pipe from
 * being mistaken for a one-row table.
 */
const tablesIn = (markdown: string): Table[] => {
    const tables: Table[] = [];
    let block: string[] = [];

    const flush = () => {
        if (block.length > 2 && /^\|[\s:|-]+\|$/.test(block[1].trim()))
            tables.push({ header: cells(block[0]), rows: block.slice(2).map((row) => cells(row)) });
        block = [];
    };

    for (const line of markdown.split('\n')) {
        if (line.trim().startsWith('|')) block.push(line);
        else flush();
    }
    flush();
    return tables;
};

/** Paragraphs, as the blank-line-separated blocks a markdown reader sees. */
const paragraphsIn = (markdown: string): string[] => markdown.split(/\n[^\S\n]*\n/);

/**
 * A cited path as it sits on disk.
 *
 * The pages write module files relative to `src/modules/` (`orders/service.ts`) and everything
 * else from the repo root (`src/kernel/events.ts`), which is how a reader reads them too.
 */
const onDisk = (cited: string): string =>
    path.join(cited.startsWith('src/') ? ROOT : MODULES_ROOT, cited);

/** `wc -l`: newlines, not visual lines, so the published number and the shell agree. */
const lineCount = (file: string): number => (readFileSync(file, 'utf8').match(/\n/g) ?? []).length;

// ── layers.md: the services over the 300-line threshold ───────────────────────────────────────

/** The one table on the page carrying a `Lines` column. */
const overThresholdTables = (): Table[] =>
    tablesIn(read('layers.md')).filter(
        ({ header }) => header.includes('File') && header.includes('Lines')
    );

interface PublishedCount {
    cited: string;
    lines: number;
}

/** Every `| \`<path>\` | <n> | … |` row of it, as the page states them. */
const publishedCounts = (): PublishedCount[] =>
    overThresholdTables().flatMap(({ header, rows }) => {
        const fileAt = header.indexOf('File');
        const linesAt = header.indexOf('Lines');

        return rows.flatMap((row) => {
            const cited = /^`([^`]+\.ts)`$/.exec(row[fileAt] ?? '');
            const lines = /^(\d+)$/.exec(row[linesAt] ?? '');
            return cited && lines ? [{ cited: cited[1], lines: Number(lines[1]) }] : [];
        });
    });

/** The count the sentence introducing that table claims, when it states one in words. */
const claimedOverThreshold = (): number | undefined => {
    const lead = /\*\*(\w+) modules? (?:are|is) over the threshold/i.exec(read('layers.md'));
    return lead ? NUMBER_WORDS[lead[1].toLowerCase()] : undefined;
};

// ── request-flow.md: the endpoints that skip the generated schema ─────────────────────────────

/**
 * The paragraph(s) making the claim, matched on what the claim is ABOUT rather than on its
 * wording — the sentence is prose and will be rewritten; the subject will not.
 */
const unparsedEndpointClaims = (): string[] =>
    paragraphsIn(read('request-flow.md')).filter(
        (paragraph) => /generated schema/i.test(paragraph) && /\bendpoints?\b/i.test(paragraph)
    );

/**
 * The controllers those paragraphs name, whatever the list happens to be.
 *
 * A backticked token shaped like `<http verb>-<something>` is this repo's controller filename
 * convention (`controller-naming.test.ts` is what holds it), which is what separates the names
 * from the `zodUserSchema` and `Content-Language` sitting in the same sentence.
 */
const controllersNamedAsUnparsed = (): string[] => {
    const named = new Set<string>();
    for (const paragraph of unparsedEndpointClaims())
        for (const [, token] of paragraph.matchAll(/`([^`]+)`/g))
            if (/^(?:get|post|put|patch|delete)-[\da-z-]+$/.test(token)) named.add(token);
    return [...named].toSorted();
};

/** Every controller basename in the tree, from disk. */
const controllersOnDisk = (): Set<string> => {
    const found = new Set<string>();
    for (const module of readdirSync(MODULES_ROOT)) {
        const directory = path.join(MODULES_ROOT, module, 'controllers');
        if (!existsSync(directory)) continue;
        for (const file of readdirSync(directory))
            if (file.endsWith('.ts')) found.add(file.replace(/\.ts$/, ''));
    }
    return found;
};

/** The count that claim states in words, when it states one. */
const claimedUnparsedEndpoints = (): number | undefined => {
    for (const paragraph of unparsedEndpointClaims()) {
        const lead = /\*\*(\w+) endpoints?\b/i.exec(paragraph);
        if (lead) return NUMBER_WORDS[lead[1].toLowerCase()];
    }
    return undefined;
};

describe('the service sizes layers.md publishes', () => {
    it('finds the over-threshold table it means to check', () => {
        // A canary. A renamed column or a reformatted table would otherwise turn every case below
        // into a sweep over an empty list, which passes and proves nothing.
        expect(tablesIn(read('layers.md')).length).toBeGreaterThanOrEqual(4);
        expect(overThresholdTables()).toHaveLength(1);
        // One row minimum: if every service is eventually split this table goes away, and this
        // line is what says so out loud rather than letting the guard quietly become a no-op.
        expect(publishedCounts().length).toBeGreaterThanOrEqual(1);
    });

    it('names only files that exist', () => {
        /*
         * The cheaper half of the rot, and the one a reader hits first: a path that moved. The
         * page is a folder map, so a citation it cannot resolve is the map being wrong about the
         * territory rather than a typo.
         */
        const missing = publishedCounts()
            .filter(({ cited }) => !existsSync(onDisk(cited)))
            .map(({ cited }) => `layers.md cites ${cited}, which is not in the tree`);

        expect(missing).toEqual([]);
    });

    it('publishes the line count the file actually has', () => {
        /*
         * The live one. Every number in this table was stale when the guard was written, and none
         * of them went stale in a commit that touched this page — a service grew, and the page
         * was wrong from that moment with nothing to say so.
         */
        const drifted = publishedCounts()
            .filter(({ cited }) => existsSync(onDisk(cited)))
            .flatMap(({ cited, lines }) => {
                const actual = lineCount(onDisk(cited));
                return actual === lines
                    ? []
                    : [`layers.md says ${cited} is ${lines} lines; wc -l says ${actual}`];
            });

        expect(drifted).toEqual([]);
    });

    it('lists as many rows as its own sentence claims', () => {
        /*
         * "Four modules are over the threshold" is a published number like any other, and it is
         * the one that goes stale when a row is ADDED — the case above cannot see a service that
         * was never written down. Only asserted while the sentence states a count in words: a
         * rewrite to "several" is a deliberate retreat from the claim, not a failure.
         */
        const published = publishedCounts();
        const claimed = claimedOverThreshold();
        const mismatch =
            claimed !== undefined && claimed !== published.length
                ? [
                      `layers.md says ${claimed} modules are over the threshold, but its table lists ${published.length}: ${published.map(({ cited }) => cited).join(', ')}`
                  ]
                : [];

        expect(mismatch).toEqual([]);
    });
});

describe('the controllers request-flow.md names', () => {
    it('finds the endpoints it means to check', () => {
        // A canary, and the load-bearing one here: this claim is a SENTENCE, so it is the fact on
        // the page most likely to be reworded out from under the parser above.
        expect(unparsedEndpointClaims().length).toBeGreaterThanOrEqual(1);
        expect(controllersNamedAsUnparsed().length).toBeGreaterThanOrEqual(1);
        expect(controllersOnDisk().size).toBeGreaterThanOrEqual(20);
    });

    it('names only controllers that exist', () => {
        /*
         * These three are named because they are EXCEPTIONS — the handlers that skip the
         * generated Zod schema and argue in place why. An exception list is exactly the prose
         * that survives the thing it excepts: rename or delete one of these controllers and the
         * page keeps warning a reader about a file that is no longer there, which reads as a
         * live rule rather than as a leftover.
         */
        const onDiskNow = controllersOnDisk();
        const missing = controllersNamedAsUnparsed()
            .filter((name) => !onDiskNow.has(name))
            .map(
                (name) =>
                    `request-flow.md names ${name} as skipping the generated schema, but no module has a controller by that name`
            );

        expect(missing).toEqual([]);
    });

    it('names as many endpoints as its own sentence claims', () => {
        // Same reasoning as the row count above: a fourth handler joining the exception list is
        // invisible to the case above and visible here.
        const named = controllersNamedAsUnparsed();
        const claimed = claimedUnparsedEndpoints();
        const mismatch =
            claimed !== undefined && claimed !== named.length
                ? [
                      `request-flow.md says ${claimed} endpoints skip the generated schema, but names ${named.length}: ${named.join(', ')}`
                  ]
                : [];

        expect(mismatch).toEqual([]);
    });
});
