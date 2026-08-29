#!/usr/bin/env tsx
/**
 * The module graph in `docs/modules/index.md`, generated from the imports it describes.
 *
 * The diagram used to be hand-drawn, and a hand-drawn graph of thirteen modules is a published
 * number with no guard behind it — correct on the day it is written and quietly wrong after the
 * next import. `dependency-cruiser` already builds the real graph for `check:dependencies`, so
 * the page can read it rather than restate it.
 *
 * WHAT IS SWEPT, and why each narrowing matters:
 *   - `--exclude /tests/` — a co-located spec may legitimately reach a sibling's barrel, manifest
 *     or tests (see `eslint.config.ts`). Left in, the sweep reports 38 edges instead of 19 and
 *     describes the test suite rather than the architecture.
 *   - `--collapse` to one node per module — the question is which DOMAIN reaches which, not which
 *     file.
 *   - `src/modules.ts` is dropped: the registry imports every manifest by definition, so its
 *     thirteen edges are a fact about the registry and would draw a star over the real shape.
 *
 * The generated block sits between markers in the page; the prose around it is written by hand and
 * is never touched. Run `--check` to fail when the two have diverged — that is what runs in
 * `complete`.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { format, resolveConfig } from 'prettier';

const checkOnly = process.argv.includes('--check');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'docs', 'modules', 'index.md');
const START = '<!-- module-graph:start -->';
const END = '<!-- module-graph:end -->';

/** How each module is coloured, by the subdomain table in docs/theory/strategic-ddd.md. */
const SUBDOMAIN: Readonly<Record<string, 'core' | 'supporting' | 'generic'>> = {
    cart: 'core',
    orders: 'core',
    products: 'core',
    delivery: 'supporting',
    inventory: 'supporting',
    payments: 'supporting',
    wishlist: 'supporting',
    account: 'generic',
    'audit-logs': 'generic',
    locales: 'generic',
    observability: 'generic',
    users: 'generic',
    feedback: 'generic'
};

/** Every module -> module edge dependency-cruiser can see, read off its collapsed mermaid output. */
const readEdges = (): [from: string, to: string][] => {
    const raw = execFileSync(
        'npx',
        [
            'depcruise',
            'src/modules',
            '--include-only',
            '^src/modules/',
            '--exclude',
            '/tests/',
            '--collapse',
            '^src/modules/[^/]+',
            '--output-type',
            'mermaid',
            '--config',
            '.dependency-cruiser.cjs'
        ],
        { cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 * 32 }
    );

    const labels = new Map(
        [...raw.matchAll(/^([\dA-Za-z]+)\["([^"]+)"]/gm)].map((m) => [m[1], m[2]])
    );

    const edges: [string, string][] = [];
    for (const match of raw.matchAll(/^([\dA-Za-z]+)-->([\dA-Za-z]+)/gm)) {
        const from = labels.get(match[1]);
        const to = labels.get(match[2]);
        // `modules.ts` is the registry, not a domain — see the header.
        if (!from || !to || from === 'modules.ts' || to === 'modules.ts') continue;
        edges.push([from, to]);
    }
    return edges.toSorted((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
};

/** Mermaid needs an identifier; `audit-logs` is not one. */
const nodeId = (name: string): string => name.replaceAll('-', '_');

const render = (edges: [string, string][]): string => {
    const names = Object.keys(SUBDOMAIN).toSorted();
    const connected = new Set(edges.flat());
    const declare = names.map((n) => (n === nodeId(n) ? `    ${n}` : `    ${nodeId(n)}["${n}"]`));
    const byKind = (kind: string) =>
        names.filter((n) => SUBDOMAIN[n] === kind && connected.has(n)).map((n) => nodeId(n));
    const isolated = names.filter((n) => !connected.has(n)).map((n) => nodeId(n));

    return [
        '```mermaid',
        "%%{init: {'flowchart': {'nodeSpacing': 26, 'rankSpacing': 52}}}%%",
        'flowchart TD',
        ...declare,
        '',
        ...edges.map(([from, to]) => `    ${nodeId(from)} --> ${nodeId(to)}`),
        '',
        '    classDef core fill:#dbeafe,stroke:#2563eb,color:#111827;',
        '    classDef supporting fill:#fef3c7,stroke:#d97706,color:#111827;',
        '    classDef generic fill:#dcfce7,stroke:#16a34a,color:#111827;',
        '    classDef isolated fill:#f4f4f5,stroke:#a1a1aa,color:#52525b,stroke-dasharray:4 3;',
        ...(byKind('core').length > 0 ? [`    class ${byKind('core').join(',')} core;`] : []),
        ...(byKind('supporting').length > 0
            ? [`    class ${byKind('supporting').join(',')} supporting;`]
            : []),
        ...(byKind('generic').length > 0
            ? [`    class ${byKind('generic').join(',')} generic;`]
            : []),
        ...(isolated.length > 0 ? [`    class ${isolated.join(',')} isolated;`] : []),
        '```',
        '',
        '| | Reaches | Reached by |',
        '| --- | --- | --- |',
        ...names
            .map((name) => {
                const reaches = edges.filter(([f]) => f === name).map(([, t]) => t);
                const reached = edges.filter(([, t]) => t === name).map(([f]) => f);
                return { name, reaches, reached, weight: reaches.length + reached.length };
            })
            .toSorted((a, b) => b.weight - a.weight || a.name.localeCompare(b.name))
            .map(
                (r) =>
                    `| \`${r.name}\` | ${r.reaches.join(', ') || '—'} | ${r.reached.join(', ') || '—'} |`
            )
    ].join('\n');
};

const run = async (): Promise<number> => {
    const page = readFileSync(PAGE, 'utf8');
    const start = page.indexOf(START);
    const end = page.indexOf(END);
    if (start === -1 || end === -1) {
        console.error(
            `[module-graph] markers ${START} / ${END} not found in docs/modules/index.md`
        );
        return 1;
    }

    const generated = render(readEdges());
    /*
     * Formatted before it is compared or written. `prettier --check` runs over `docs/` in
     * `complete` too, so an unformatted block would leave the two checks demanding different
     * bytes from the same file — each one undoing the other.
     */
    const next = await format(
        `${page.slice(0, start + START.length)}\n\n${generated}\n\n${page.slice(end)}`,
        { ...(await resolveConfig(PAGE)), filepath: PAGE }
    );

    if (next === page) {
        console.log('[module-graph] docs/modules/index.md matches the import graph.');
        return 0;
    }

    if (checkOnly) {
        console.error(
            '[module-graph] docs/modules/index.md is out of date with the import graph.\n' +
                '               Run `npm run docs:graph` and commit the result.'
        );
        return 1;
    }

    writeFileSync(PAGE, next);
    console.log('[module-graph] docs/modules/index.md updated from the import graph.');
    return 0;
};

void run().then((code) => {
    process.exitCode = code;
});
