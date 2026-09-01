#!/usr/bin/env tsx
/**
 * The module graph in `docs/modules/index.md`, plus one neighbourhood diagram per module page,
 * generated from the imports and subscriptions they describe.
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
 * The index map stays imports-only, because the prose around it argues about exactly that. The
 * per-module neighbourhoods add the event edges on top, which is the return path an import graph
 * cannot see — see `readEventEdges`.
 *
 * Each generated block sits between markers in its page; the prose around it is written by hand and
 * is never touched. Run `--check` to fail when the two have diverged — that is what runs in
 * `complete`.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { format, resolveConfig } from 'prettier';

const checkOnly = process.argv.includes('--check');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'docs', 'modules', 'index.md');
const START = '<!-- module-graph:start -->';
const END = '<!-- module-graph:end -->';

/** One module announcing a domain event that another module subscribes to. */
interface EventEdge {
    owner: string;
    subscriber: string;
    event: string;
}

/** A generated block and the page it belongs in, resolved before anything is written. */
interface Target {
    file: string;
    start: string;
    end: string;
    body: string;
}

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

/** The wire name behind an event constant, read from the events file of the module that owns it. */
const eventName = (owner: string, constant: string): string => {
    const file = path.join(ROOT, 'src', 'modules', owner, 'events.ts');
    if (!existsSync(file)) return constant;
    const declared = new RegExp(String.raw`export const ${constant}\s*=\s*'([^']+)'`).exec(
        readFileSync(file, 'utf8')
    );
    return declared ? declared[1] : constant;
};

/**
 * Every `onDomainEvent` subscription, as an owner -> subscriber edge carrying the event name.
 *
 * These are the edges `readEdges` reports backwards: a subscriber imports the constant, so the
 * import points at the owner while the message travels the other way. Resolvable because the shape
 * never varies — `onDomainEvent(CONST, …)` with `CONST` imported from a sibling's barrel.
 */
const readEventEdges = (): EventEdge[] => {
    const edges: EventEdge[] = [];

    for (const subscriber of Object.keys(SUBDOMAIN)) {
        const manifest = path.join(ROOT, 'src', 'modules', subscriber, 'module.ts');
        if (!existsSync(manifest)) continue;
        const source = readFileSync(manifest, 'utf8');

        // Which sibling each imported symbol came from, so a subscription can name its owner.
        const owners = new Map<string, string>();
        for (const line of source.matchAll(/import\s*{([^}]+)}\s*from\s*'@modules\/([^']+)'/g))
            for (const symbol of line[1].split(',')) owners.set(symbol.trim(), line[2]);

        for (const call of source.matchAll(/onDomainEvent\(\s*([A-Z][\dA-Z_]*)/g)) {
            const owner = owners.get(call[1]);
            // A module listening to itself is a local concern, not a cross-module edge.
            if (!owner || owner === subscriber) continue;
            edges.push({ owner, subscriber, event: eventName(owner, call[1]) });
        }
    }

    return edges.toSorted(
        (a, b) =>
            a.owner.localeCompare(b.owner) ||
            a.subscriber.localeCompare(b.subscriber) ||
            a.event.localeCompare(b.event)
    );
};

/** How one module is drawn among its neighbours: solid for imports, dotted for events. */
const renderNeighbourhood = (
    name: string,
    edges: [string, string][],
    events: EventEdge[]
): string => {
    const reaches = edges.filter(([from]) => from === name).map(([, to]) => to);
    const reached = edges.filter(([, to]) => to === name).map(([from]) => from);
    const announces = events.filter((e) => e.owner === name);
    const listens = events.filter((e) => e.subscriber === name);

    const neighbours = [
        ...new Set([
            ...reaches,
            ...reached,
            ...announces.map((e) => e.subscriber),
            ...listens.map((e) => e.owner)
        ])
    ].toSorted();

    // A diagram of one node says less than the sentence it would need anyway.
    if (neighbours.length === 0)
        return `_Nothing reaches \`${name}\` and it reaches nothing — no imports either way, no events either way. Deleting it takes one folder and this page, and no other page changes._`;

    const byKind = (kind: string) =>
        neighbours.filter((n) => SUBDOMAIN[n] === kind).map((n) => nodeId(n));
    const classOf = (kind: string) =>
        byKind(kind).length > 0 ? [`    class ${byKind(kind).join(',')} ${kind};`] : [];

    return [
        '_Solid arrows are imports. Dotted arrows are domain events — the return path an import',
        'graph cannot see._',
        '',
        '```mermaid',
        "%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 60}}}%%",
        'flowchart LR',
        `    ${nodeId(name)}["${name}<br/><i>this module</i>"]`,
        ...neighbours.map((n) => `    ${nodeId(n)}["${n}"]`),
        '',
        ...reached.map((from) => `    ${nodeId(from)} --> ${nodeId(name)}`),
        ...reaches.map((to) => `    ${nodeId(name)} --> ${nodeId(to)}`),
        ...listens.map((e) => `    ${nodeId(e.owner)} -. "${e.event}" .-> ${nodeId(name)}`),
        ...announces.map((e) => `    ${nodeId(name)} -. "${e.event}" .-> ${nodeId(e.subscriber)}`),
        '',
        '    classDef core fill:#dbeafe,stroke:#2563eb,color:#111827;',
        '    classDef supporting fill:#fef3c7,stroke:#d97706,color:#111827;',
        '    classDef generic fill:#dcfce7,stroke:#16a34a,color:#111827;',
        '    classDef centre fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#111827;',
        ...classOf('core'),
        ...classOf('supporting'),
        ...classOf('generic'),
        `    class ${nodeId(name)} centre;`,
        '```'
    ].join('\n');
};

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

/** Writes one generated block into its page, or reports that it drifted. Returns the exit code. */
const applyTarget = async ({ file, start, end, body }: Target): Promise<number> => {
    const label = path.relative(ROOT, file);
    const page = readFileSync(file, 'utf8');
    const from = page.indexOf(start);
    const to = page.indexOf(end);
    if (from === -1 || to === -1) {
        console.error(`[module-graph] markers ${start} / ${end} not found in ${label}`);
        return 1;
    }

    /*
     * Formatted before it is compared or written. `prettier --check` runs over `docs/` in
     * `complete` too, so an unformatted block would leave the two checks demanding different
     * bytes from the same file — each one undoing the other.
     */
    const next = await format(
        `${page.slice(0, from + start.length)}\n\n${body}\n\n${page.slice(to)}`,
        { ...(await resolveConfig(file)), filepath: file }
    );

    if (next === page) return 0;

    if (checkOnly) {
        console.error(
            `[module-graph] ${label} is out of date with the module graph.\n` +
                '               Run `npm run docs:graph` and commit the result.'
        );
        return 1;
    }

    writeFileSync(file, next);
    console.log(`[module-graph] ${label} updated.`);
    return 0;
};

/** Every block this script owns: the index map, then one neighbourhood per module page. */
const targets = (): Target[] => {
    const edges = readEdges();
    const events = readEventEdges();

    return [
        { file: PAGE, start: START, end: END, body: render(edges) },
        ...Object.keys(SUBDOMAIN)
            .toSorted()
            .map((name) => ({
                file: path.join(ROOT, 'docs', 'modules', `${name}.md`),
                start: `<!-- module-graph:${name}:start -->`,
                end: `<!-- module-graph:${name}:end -->`,
                body: renderNeighbourhood(name, edges, events)
            }))
    ];
};

const run = async (): Promise<number> => {
    let code = 0;
    // Sequential so the log reads in page order, and so one missing marker does not hide the rest.
    for (const target of targets()) code = (await applyTarget(target)) || code;

    if (code === 0) console.log('[module-graph] docs/modules matches the module graph.');
    return code;
};

void run().then((code) => {
    process.exitCode = code;
});
