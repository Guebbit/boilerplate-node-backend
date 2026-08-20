/**
 * The blocks on `docs/modules/index.md` — the whole map, rather than one module's slice of it.
 *
 * See: docs/modules/index.md
 */

import type { ModuleFacts } from './facts';
import { FRONTEND_PAIRING, FRONTEND_ONLY } from './pairing';

const ARROW: Partial<Record<string, string>> = {
    conformist: '-->',
    'customer-supplier': '==>',
    'published-language': '-.->',
    'shared-kernel': '<==>'
};

const nodeId = (name: string): string => name.replaceAll('-', '_');

const table = (headers: string[], rows: string[][]): string =>
    [
        `| ${headers.join(' | ')} |`,
        `| ${headers.map(() => '---').join(' | ')} |`,
        ...rows.map((row) => `| ${row.join(' | ')} |`)
    ].join('\n');

/** The legend every other diagram in this section obeys. */
export const legendBlock = (): string =>
    [
        '**Node fill — where the domain sits in the business.**',
        '',
        table(
            ['Fill', 'Subdomain', 'What it means'],
            [
                [
                    '🟪 violet',
                    '`core`',
                    'The reason the product exists. Worth entities, value objects and invariants.'
                ],
                [
                    '🟦 blue',
                    '`supporting`',
                    'Specific to this business but not a differentiator. Kept plain.'
                ],
                [
                    '🟩 teal',
                    '`generic`',
                    'A solved problem. Modelling effort here is waste — a `domain/` folder inside one fails `tests/cross-cutting/subdomain-discipline.test.ts`.'
                ]
            ]
        ),
        '',
        '**Arrow style — what kind of relationship the edge is.**',
        '',
        table(
            ['Arrow', 'Relationship', 'What crosses the edge'],
            [
                [
                    '`-->` thin',
                    '`conformist`',
                    'Reads the upstream’s records as they are. No translation, no say in the shape.'
                ],
                [
                    '`==>` thick',
                    '`customer-supplier`',
                    'Asks the upstream to *do* something; its published surface answers the demand.'
                ],
                [
                    '`-.->` dashed',
                    '`published-language`',
                    'Receives vocabulary, not records — pure functions over plain data.'
                ],
                [
                    '`<==>` double',
                    '`shared-kernel`',
                    'Both read and write the same model. The expensive one, kept near zero.'
                ]
            ]
        ),
        '',
        'Every diagram under `/modules/` uses this and only this. Since the diagrams are generated, obedience is free.'
    ].join('\n');

/** The whole context map, subdomains as subgraphs so the three tiers read at a glance. */
export const overviewMapBlock = (all: ModuleFacts[]): string => {
    const lines = [
        '```mermaid',
        "%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 80}}}%%",
        'flowchart LR'
    ];

    for (const [subdomain, label] of [
        ['core', 'core'],
        ['supporting', 'supporting'],
        ['generic', 'generic']
    ]) {
        const members = all.filter((facts) => facts.subdomain === subdomain);
        if (members.length === 0) continue;
        lines.push(`    subgraph ${label.toUpperCase()}["${label}"]`, '        direction TB');
        for (const facts of members) lines.push(`        ${nodeId(facts.name)}["${facts.name}"]`);
        lines.push('    end');
    }

    for (const facts of all)
        for (const edge of facts.dependsOn)
            lines.push(
                `    ${nodeId(facts.name)} ${ARROW[edge.as] ?? '-->'} ${nodeId(edge.module)}`
            );

    lines.push(
        '',
        '    classDef core fill:#ede9fe,stroke:#7c3aed,color:#111827;',
        '    classDef supporting fill:#dbeafe,stroke:#2563eb,color:#111827;',
        '    classDef generic fill:#ccfbf1,stroke:#0f766e,color:#111827;'
    );
    for (const subdomain of ['core', 'supporting', 'generic']) {
        const members = all.filter((facts) => facts.subdomain === subdomain);
        if (members.length > 0)
            lines.push(
                `    class ${members.map((facts) => nodeId(facts.name)).join(',')} ${subdomain};`
            );
    }
    lines.push(
        '    style CORE fill:#faf8ff,stroke:#cbd5e1',
        '    style SUPPORTING fill:#f8fafc,stroke:#cbd5e1',
        '    style GENERIC fill:#f8fdfc,stroke:#cbd5e1',
        '```'
    );

    return lines.join('\n');
};

/** One row per module: the answer to "which one is this?" without opening a page. */
export const matrixBlock = (all: ModuleFacts[]): string =>
    table(
        [
            'Module',
            'Subdomain',
            'Base path',
            'Collection',
            'Routes',
            'Depends on',
            'Depended on by'
        ],
        all.map((facts) => [
            `[\`${facts.name}\`](./${facts.name}.md)`,
            `\`${facts.subdomain}\``,
            facts.basePath ? `\`${facts.basePath}\`` : '_headless_',
            facts.collections.length > 0
                ? facts.collections
                      .map((collection) => `\`${collection.collectionName}\``)
                      .join(' · ')
                : '—',
            String(facts.endpoints.length),
            String(facts.dependsOn.length),
            String(facts.dependents.length)
        ])
    );

/** The cross-repository pairing, including the modules that have no counterpart. */
export const pairingBlock = (all: ModuleFacts[]): string =>
    [
        table(
            ['This repository', 'boilerplate-vue-frontend', 'Note'],
            all.map((facts) => {
                const pairing = FRONTEND_PAIRING[facts.name];
                const counterparts = pairing?.counterparts.length
                    ? pairing.counterparts.map((name) => `\`${name}\``).join(' + ')
                    : '_none_';
                return [
                    `[\`${facts.name}\`](./${facts.name}.md)`,
                    counterparts,
                    pairing?.why ?? '—'
                ];
            })
        ),
        '',
        '**Frontend modules with no counterpart here**',
        '',
        table(
            ['Frontend module', 'Why it stands alone'],
            Object.entries(FRONTEND_ONLY).map(([name, why]) => [`\`${name}\``, why])
        )
    ].join('\n');

/** Counts, so the shape of the system is one line rather than a count of table rows. */
export const tallyBlock = (all: ModuleFacts[]): string => {
    const by = (subdomain: string): number =>
        all.filter((facts) => facts.subdomain === subdomain).length;
    const routes = all.reduce((total, facts) => total + facts.endpoints.length, 0);
    const collections = all.reduce((total, facts) => total + facts.collections.length, 0);
    const edges = all.reduce((total, facts) => total + facts.dependsOn.length, 0);

    return table(
        ['Modules', 'core', 'supporting', 'generic', 'Collections', 'Routes', 'Context edges'],
        [
            [
                String(all.length),
                String(by('core')),
                String(by('supporting')),
                String(by('generic')),
                String(collections),
                String(routes),
                String(edges)
            ]
        ]
    );
};

/**
 * Every route in the application, in one table — the block on `docs/api/endpoints.md`.
 *
 * Generated from the same routers the module pages read, so the API index and thirteen module
 * pages cannot disagree about what the application serves. The prose around it on that page is
 * hand-written and stays that way; only the routes are assembled.
 */
export const allEndpointsBlock = (all: ModuleFacts[]): string => {
    const rows = all.flatMap((facts) =>
        facts.endpoints.map((endpoint) => [
            `[\`${facts.name}\`](../modules/${facts.name}.md)`,
            `\`${endpoint.method}\``,
            `\`${endpoint.path}\``,
            endpoint.middlewares.includes('isAdmin')
                ? 'admin'
                : endpoint.middlewares.includes('isAuth')
                  ? 'user'
                  : 'none',
            endpoint.summary ?? '—'
        ])
    );

    return [
        table(['Module', 'Method', 'Path', 'Auth', 'What it does'], rows),
        '',
        `${rows.length} routes across ${all.filter((facts) => facts.endpoints.length).length} modules. ` +
            'The **Auth** column reads the mounted middleware chain rather than the contract, so it is ' +
            'what the server actually enforces. Each module page carries the same routes with their full ' +
            'middleware chain and controller.'
    ].join('\n');
};
