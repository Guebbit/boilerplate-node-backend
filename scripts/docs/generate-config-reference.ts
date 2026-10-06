#!/usr/bin/env tsx
/**
 * The configuration reference in `docs/tools/configuration.md`: every environment variable the
 * application reads, its type, default and rules, grouped by the slice that owns it.
 *
 * Generated because a hand-kept variable list goes stale silently, and this one is read straight
 * off the same `defineConfig` slices the boot gate validates (`allConfigSlices`), plus the
 * seeder's own (`scenarios/config.ts`), which the app never boots with. A variable no
 * slice declares is not read by `src/` at all — `no-restricted-properties` in `eslint.config.ts`
 * refuses a raw `process.env` there — so the list is complete by construction.
 *
 * Same shape as `generate-rate-limit-budgets.ts`: markers in the page, prose around them
 * untouched, `--check` in `complete`. Also refuses a variable two slices declare differently, since
 * one of the two readers would then be parsing something the other does not.
 */

import path from 'node:path';
import { allConfigSlices } from '../../src/app/config';
import { enabledModules } from '../../src/modules';
import { demoSinkConfig, seedPasswordsConfig } from '../../scenarios/config';
import type { ConfigSlice, FieldInfo } from '@infrastructure/config/define';
import { fileFormOf } from '@infrastructure/config/secret-files';
import { applyMarkerBlocks } from './marker-block';

/** Report drift instead of rewriting the page — what `complete` runs. */
const checkOnly = process.argv.includes('--check');

/** Repo root, two levels up from `scripts/docs/`. */
const ROOT = path.join(__dirname, '../..');

/** The page the reference lives in. */
const PAGE = path.join(ROOT, 'docs/tools/configuration.md');

/** Markers bounding the generated block inside the page — everything between them is replaced. */
const START = '<!-- config-reference:start -->';
const END = '<!-- config-reference:end -->';

/**
 * A slice made of rate-limit budgets: its variables are listed, with their windows and keys, in
 * `docs/tools/security.md#the-rate-limit-budgets` — the one home for that table.
 */
const isBudgetSlice = (slice: ConfigSlice): boolean => slice.name.endsWith('-rate-limits');

/**
 * How one field reads in the Rules column: what it requires, forbids or hides.
 *
 * @param field - the field
 */
const rules = (field: FieldInfo): string => {
    const { presence } = field;
    const parts: string[] = [];
    if (presence) {
        const length = presence.minLength > 0 ? `, ${String(presence.minLength)}+ characters` : '';
        const bytes =
            presence.minBytes === undefined
                ? ''
                : `, hex or base64 of ${String(presence.minBytes)}+ bytes`;
        const placeholder = presence.placeholder ? ', never the `.env-example` placeholder' : '';
        const scope = presence.productionOnly ? ', outside development/test' : '';
        parts.push(`required${length}${bytes}${placeholder}${scope}`);
    }
    if (field.sensitive) {
        const fileForm = fileFormOf(field.name);
        parts.push(`secret: never logged${fileForm === undefined ? '' : `; or \`${fileForm}\``}`);
    }
    return parts.length > 0 ? parts.join('; ') : '—';
};

/**
 * Escapes a cell so a `|` in a description cannot split the row.
 *
 * @param text - the cell text
 */
const cell = (text: string): string => text.replaceAll('|', String.raw`\|`);

/**
 * Every slice with variables, each variable once, with two readers' disagreement refused.
 *
 * @returns the slices to render, and the variables that were declared twice with different shapes
 */
const collect = (): { slices: { name: string; fields: FieldInfo[] }[]; conflicts: string[] } => {
    const seen = new Map<string, FieldInfo>();
    const conflicts: string[] = [];
    const slices: { name: string; fields: FieldInfo[] }[] = [];

    for (const slice of [
        ...allConfigSlices(enabledModules),
        seedPasswordsConfig.slice,
        demoSinkConfig.slice
    ].filter((entry) => !isBudgetSlice(entry))) {
        const fields: FieldInfo[] = [];
        for (const field of slice.fields) {
            const earlier = seen.get(field.name);
            if (earlier === undefined) {
                seen.set(field.name, field);
                fields.push(field);
            } else if (
                earlier.doc.type !== field.doc.type ||
                earlier.doc.default !== field.doc.default
            ) {
                conflicts.push(
                    `${field.name}: ${slice.name} declares it as \`${field.doc.type}\` (default ${field.doc.default ?? 'none'}), an earlier slice as \`${earlier.doc.type}\` (default ${earlier.doc.default ?? 'none'})`
                );
            }
        }
        if (fields.length > 0) slices.push({ name: slice.name, fields });
    }
    return { slices, conflicts };
};

/**
 * One slice's table.
 *
 * @param name - the slice name
 * @param fields - its variables
 */
const table = (name: string, fields: readonly FieldInfo[]): string =>
    [
        `### ${name}`,
        '',
        '| Variable | Type | Default | Rules | What it does |',
        '| --- | --- | --- | --- | --- |',
        ...fields.map(
            (field) =>
                `| \`${field.name}\` | ${cell(field.doc.type)} | ${
                    field.doc.default === undefined ? '—' : `\`${cell(field.doc.default)}\``
                } | ${cell(rules(field))} | ${cell(field.doc.describe ?? '')} |`
        )
    ].join('\n');

const { slices, conflicts } = collect();

if (conflicts.length > 0) {
    console.error(
        `[config-reference] a variable is declared two ways:\n  ${conflicts.join('\n  ')}`
    );
    process.exitCode = 1;
} else {
    void applyMarkerBlocks({
        file: PAGE,
        root: ROOT,
        blocks: [
            {
                start: START,
                end: END,
                body: slices.map(({ name, fields }) => table(name, fields)).join('\n\n')
            }
        ],
        label: 'config-reference',
        checkOnly,
        driftSubject: 'the configuration slices',
        rerunScript: 'docs:config'
    }).then((code) => {
        process.exitCode = code;
    });
}
