/**
 * Every generated block of a module page, rendered from `ModuleFacts`.
 *
 * One function per block, each returning the markdown that sits between its markers. Blocks never
 * explain a mechanism — that is what `docs/theory/`, `docs/tools/` and `docs/api/` are for — they
 * state what THIS module does and link out for what the thing is.
 *
 * See: docs/modules/index.md
 */

import type { ModuleFacts, FieldFact } from './facts';
import { FRONTEND_PAIRING } from './pairing';

/** What each subdomain label means, in the half-sentence a table cell can hold. */
const SUBDOMAIN_GLOSS: Partial<Record<string, string>> = {
    core: 'The reason the product exists. Worth entities, value objects and invariants.',
    supporting: 'Specific to this business but not a differentiator. Kept plain.',
    generic: 'A solved problem. Modelling effort here would be waste.'
};

/** Mermaid arrow per relationship, so an edge's kind is readable without a legend beside it. */
const ARROW: Partial<Record<string, string>> = {
    conformist: '-->',
    'customer-supplier': '==>',
    'published-language': '-.->',
    'shared-kernel': '<==>'
};

/** Mermaid class per subdomain. Declared once here and emitted into every diagram. */
const CLASS_DEFS = [
    'classDef core fill:#ede9fe,stroke:#7c3aed,color:#111827;',
    'classDef supporting fill:#dbeafe,stroke:#2563eb,color:#111827;',
    'classDef generic fill:#ccfbf1,stroke:#0f766e,color:#111827;',
    'classDef self fill:#fef3c7,stroke:#d97706,color:#111827,stroke-width:2px;'
];

/** A mermaid-safe node id — module names carry hyphens, which mermaid reads as an edge. */
const nodeId = (name: string): string => name.replaceAll('-', '_');

/** Wrap rows in a markdown table, or return the empty-state line when there are none. */
const table = (headers: string[], rows: string[][], empty: string): string => {
    if (rows.length === 0) return empty;
    return [
        `| ${headers.join(' | ')} |`,
        `| ${headers.map(() => '---').join(' | ')} |`,
        ...rows.map((row) => `| ${row.join(' | ')} |`)
    ].join('\n');
};

/** Backtick a value, or an em dash when there is nothing to show. */
const code = (value?: string): string => (value ? `\`${value}\`` : '—');

/** Block 1 — the identity card: what this is, in facts that fit on one screen. */
export const identityBlock = (facts: ModuleFacts, all: ModuleFacts[]): string => {
    const pairing = FRONTEND_PAIRING[facts.name];
    const counterpart = pairing?.counterparts.length
        ? `${pairing.counterparts.map((name) => `\`${name}\``).join(' + ')} in \`boilerplate-vue-frontend\``
        : '_none_';

    const rows: string[][] = [
        ['**Subdomain**', `\`${facts.subdomain}\` — ${SUBDOMAIN_GLOSS[facts.subdomain] ?? ''}`],
        [
            '**Base path**',
            facts.basePath
                ? `\`${facts.basePath}\``
                : '_headless_ — this module owns no URL of its own'
        ],
        [
            facts.collections.length > 1 ? '**Collections**' : '**Collection**',
            facts.collections.length > 0
                ? facts.collections
                      .map(
                          (collection) =>
                              `\`${collection.collectionName}\` (model \`${collection.modelName}\`)`
                      )
                      .join(' · ')
                : '_none_ — owns no collection'
        ],
        [
            '**Depends on**',
            facts.dependsOn.length > 0
                ? facts.dependsOn
                      .map((edge) => `[\`${edge.module}\`](./${edge.module}.md)`)
                      .join(' · ')
                : '_nothing_'
        ],
        [
            '**Depended on by**',
            facts.dependents.length > 0
                ? facts.dependents
                      .map((edge) => `[\`${edge.from}\`](./${edge.from}.md)`)
                      .join(' · ')
                : '_nothing_'
        ],
        [
            '**Languages**',
            facts.locales.length > 0
                ? facts.locales.map((value) => code(value)).join(' · ')
                : '_none_'
        ],
        [
            '**Seeded**',
            facts.seeds
                ? `yes${
                      facts.demoShapes
                          ? ` — ${Object.entries(facts.demoShapes)
                                .map(([collection, shape]) => `\`${collection}\` as \`${shape}\``)
                                .join(', ')}`
                          : ''
                  }`
                : 'no'
        ],
        ['**Frontend counterpart**', pairing?.why ? `${counterpart} — ${pairing.why}` : counterpart]
    ];

    const orphan = all.length > 0 && facts.dependsOn.length === 0 && facts.dependents.length === 0;

    return [
        table(['Fact', 'This module'], rows, ''),
        orphan
            ? '\n::: info Stands alone\nNo module depends on this one and it depends on none. Deleting the folder and its line in `src/modules.ts` costs nothing else.\n:::'
            : ''
    ]
        .filter(Boolean)
        .join('\n');
};

/** Block 2 — the context map: this module centred, with both directions of every edge. */
export const mapBlock = (facts: ModuleFacts, all: ModuleFacts[]): string => {
    const subdomainOf = new Map(all.map((entry) => [entry.name, entry.subdomain]));
    const involved = new Set<string>([
        ...facts.dependsOn.map((edge) => edge.module),
        ...facts.dependents.map((edge) => edge.from)
    ]);

    if (involved.size === 0)
        return `\`${facts.name}\` sits on no edge of the context map — nothing imports it and it imports nothing.`;

    const lines = [
        "%%{init: {'flowchart': {'nodeSpacing': 45, 'rankSpacing': 75}}}%%",
        'flowchart LR'
    ];

    for (const edge of facts.dependents)
        lines.push(
            `    ${nodeId(edge.from)}["${edge.from}"] ${ARROW[edge.as] ?? '-->'}|"${edge.as}"| ${nodeId(facts.name)}["<b>${facts.name}</b>"]`
        );
    for (const edge of facts.dependsOn)
        lines.push(
            `    ${nodeId(facts.name)}["<b>${facts.name}</b>"] ${ARROW[edge.as] ?? '-->'}|"${edge.as}"| ${nodeId(edge.module)}["${edge.module}"]`
        );

    lines.push('', ...CLASS_DEFS.map((line) => `    ${line}`));
    for (const subdomain of ['core', 'supporting', 'generic']) {
        const members = [...involved].filter((name) => subdomainOf.get(name) === subdomain);
        if (members.length > 0)
            lines.push(`    class ${members.map((name) => nodeId(name)).join(',')} ${subdomain};`);
    }
    lines.push(`    class ${nodeId(facts.name)} self;`);

    const reasons = [
        ...facts.dependents.map((edge) => `- \`${edge.from}\` → **${edge.as}** — ${edge.because}`),
        ...facts.dependsOn.map((edge) => `- → \`${edge.module}\` **${edge.as}** — ${edge.because}`)
    ];

    return ['```mermaid', ...lines, '```', '', ...reasons].join('\n');
};

/** One field row, indented when it belongs to a sub-document. */
const fieldRows = (fields: FieldFact[], prefix = ''): string[][] =>
    fields.flatMap((field) => {
        const flags = [
            field.required ? 'required' : '',
            field.unique ? 'unique' : '',
            field.indexed ? 'indexed' : ''
        ].filter(Boolean);

        const row = [
            `${prefix}\`${field.path}\``,
            `\`${field.type}\``,
            flags.length > 0 ? flags.join(', ') : '—',
            field.default ?? '—',
            field.ref
                ? `→ \`${field.ref}\``
                : field.enum
                  ? field.enum.map((value) => code(value)).join(String.raw` \| `)
                  : '—'
        ];
        return [row, ...fieldRows(field.children ?? [], `${prefix}↳ `)];
    });

/** Block 4 — every collection the module owns: its fields, and the indexes that are not field options. */
export const dataBlock = (facts: ModuleFacts): string => {
    if (facts.collections.length === 0)
        return 'This module owns no collection. Whatever state it reads belongs to a module it depends on.';

    const parts: string[] = [];

    for (const collection of facts.collections) {
        parts.push(
            `#### \`${collection.collectionName}\``,
            '',
            `From model \`${collection.modelName}\`. \`_id\` and \`__v\` are omitted — every document carries them.`,
            '',
            table(
                ['Field', 'Type', 'Flags', 'Default', 'Reference / values'],
                fieldRows(collection.fields),
                '_No fields._'
            )
        );

        if (collection.indexes.length > 0)
            parts.push(
                '',
                '**Declared indexes**',
                '',
                table(
                    ['Keys', 'Options'],
                    collection.indexes.map((index) => [`\`${index.keys}\``, index.options]),
                    ''
                )
            );

        parts.push('');
    }

    return parts.join('\n').trimEnd();
};

/** Block 5 — the URL surface, as express mounted it and as the fragment describes it. */
export const surfaceBlock = (facts: ModuleFacts): string => {
    if (facts.endpoints.length === 0)
        return 'This module mounts no routes. It is reached through its barrel by the modules that depend on it, or through another module’s endpoints.';

    const rows = facts.endpoints.map((endpoint) => [
        `\`${endpoint.method} ${endpoint.path}\``,
        endpoint.middlewares.length > 0
            ? endpoint.middlewares.map((name) => code(name)).join(' → ')
            : '—',
        code(endpoint.controller),
        endpoint.summary ?? '—'
    ]);

    return [
        table(['Endpoint', 'Middlewares', 'Controller', 'What it does'], rows, ''),
        '',
        'Middlewares run left to right; the controller is the last handler on the route. Summaries come from this module’s own `openapi.yaml`, which is where they are edited.'
    ].join('\n');
};

/** Block 6 — everything this module emits that is not a response. */
export const signalsBlock = (facts: ModuleFacts): string => {
    const sections: string[] = [];

    if (facts.publishes.length > 0 || facts.subscribes.length > 0)
        sections.push(
            '#### Domain events',
            '',
            table(
                ['Event', 'Direction'],
                [
                    ...facts.publishes.map((name) => [`\`${name}\``, 'published by this module']),
                    ...facts.subscribes.map((name) => [
                        `\`${name}\``,
                        'subscribed to in `module.ts`'
                    ])
                ],
                ''
            )
        );

    if (Object.keys(facts.auditActions).length > 0)
        sections.push(
            '#### Audit actions',
            '',
            table(
                ['Constant', 'Action name'],
                Object.entries(facts.auditActions).map(([key, value]) => [
                    `\`${key}\``,
                    `\`${value}\``
                ]),
                ''
            )
        );

    if (Object.keys(facts.analyticsEvents).length > 0)
        sections.push(
            '#### Analytics events',
            '',
            table(
                ['Constant', 'Event name'],
                Object.entries(facts.analyticsEvents).map(([key, value]) => [
                    `\`${key}\``,
                    `\`${value}\``
                ]),
                ''
            )
        );

    if (facts.metrics.length > 0)
        sections.push(
            '#### Metrics',
            '',
            table(
                ['Collector', 'Type', 'Labels', 'Help'],
                facts.metrics.map((metric) => [
                    `\`${metric.name}\``,
                    metric.type,
                    metric.labels.length > 0
                        ? metric.labels.map((value) => code(value)).join(', ')
                        : '—',
                    metric.help
                ]),
                ''
            )
        );

    if (facts.probes.length > 0)
        sections.push(
            '#### Contract probes',
            '',
            'Requests the contract cannot describe — the calls that prove this module refuses things.',
            '',
            table(
                ['Call', 'Probe'],
                facts.probes.map((probe) => [`\`${probe.method} ${probe.path}\``, probe.name]),
                ''
            )
        );

    return sections.length > 0
        ? sections.join('\n').replaceAll(/\n(#{4})/g, '\n\n$1')
        : 'This module emits no domain events, writes nothing to the audit trail, registers no metrics and declares no probes. Its only output is its responses.';
};

/** Block 7 — every file in the folder, so nothing in the domain is unaccounted for. */
export const filesBlock = (facts: ModuleFacts): string =>
    table(
        ['File', 'What it is', 'Explained in'],
        facts.files.map((file) => [
            `\`${file.path}\``,
            file.what,
            file.reads ? `[read](${file.reads})` : '—'
        ]),
        '_This module folder is empty._'
    );

/** Block 8 — what is tested and how to run it. */
export const workingBlock = (facts: ModuleFacts): string => {
    const rows = [
        ['Unit', String(facts.unitTests), '`src/modules/' + facts.name + '/tests/unit/`'],
        [
            'Contract',
            String(facts.contractTests),
            '`src/modules/' + facts.name + '/tests/contract/`'
        ]
    ].filter((row) => row[1] !== '0');

    const commands = [
        '```bash',
        `# every suite this module carries`,
        `npm run test:module -- src/modules/${facts.name}`,
        ''
    ];
    if (facts.files.some((file) => file.path === 'openapi.yaml'))
        commands.push(
            '# after editing this module’s openapi.yaml',
            'npm run contracts:bundle && npm run lint:openapi:modules'
        );
    if (facts.seedExport)
        commands.push(
            '',
            '# after editing this module’s seeds',
            'npm run db:seed && npm run check:seed-export'
        );
    commands.push('```');

    return [
        table(['Suite', 'Files', 'Where'], rows, '_This module carries no tests of its own._'),
        '',
        ...commands
    ].join('\n');
};
