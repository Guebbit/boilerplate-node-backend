/**
 * @module
 * The frontend-link rows only a removed module used: `links:` and `staffPages:` entries in
 * `shared/rules/frontend-links.yaml`, their keys in the schema that checks it, and a static page
 * named after a removed module (`products`).
 *
 * A row goes when a removed module's source names it (`FRONTEND_LINK_RULES.links.order`,
 * `PAGES.return`) and nothing that stays does. A row nothing names stays: it is not a removed
 * module's to take. Read BEFORE the folders go ({@link readRemovedLinkRows}), as the other
 * removal steps do; the schema's generated JSON and the frontend's copy follow from `regenerate`.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { isPlainObject } from '@infrastructure/object-guards';
import type { RemovalNote } from './demo-remove-registry';

/** The shared file, relative to the repo root. */
const LINKS_FILE = path.join('shared', 'rules', 'frontend-links.yaml');

/** The schema that checks it, relative to the repo root. */
const SCHEMA_FILE = path.join(
    'src',
    'infrastructure',
    'config',
    'shared-rules',
    'frontend-links.ts'
);

/** The two maps of paths keyed by name, and the list of public pages. */
type Section = 'links' | 'staffPages';

/** What a removal takes from the file: row names per map, and static pages. */
export interface RemovedLinkRows {
    /** `links:` keys. */
    links: string[];
    /** `staffPages:` keys. */
    staffPages: string[];
    /** `staticPages:` entries. */
    staticPages: string[];
}

/**
 * Every non-test `.ts` file under a folder.
 * @param directory - where to start
 */
const sourceFiles = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return entry.name === 'tests' ? [] : sourceFiles(full);
        return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : [];
    });

/**
 * Whether a source text names one row: `links.order`, `staffPages.return` or `PAGES.return` (the
 * alias a module keeps for `staffPages`), or, in a file that reads `FRONTEND_LINK_RULES`, the key
 * as a quoted literal (`page: 'order'`, a lookup by name).
 * @param source - a file's text
 * @param section - which map
 * @param key - the row's name, as the YAML spells it
 */
const names = (source: string, section: Section, key: string): boolean =>
    new RegExp(
        String.raw`\b(?:${section}${section === 'staffPages' ? '|PAGES' : ''})\.${key}\b`
    ).test(source) ||
    (source.includes('FRONTEND_LINK_RULES') && new RegExp(`['"]${key}['"]`).test(source));

/**
 * The rows and static pages a removal of `removedNames` leaves nothing to use.
 * @param repoRoot - the checkout, read while the modules still exist
 * @param removedNames - the module folders about to go
 */
export const readRemovedLinkRows = (
    repoRoot: string,
    removedNames: readonly string[]
): RemovedLinkRows => {
    const none: RemovedLinkRows = { links: [], staffPages: [], staticPages: [] };
    const file = path.join(repoRoot, LINKS_FILE);
    if (!existsSync(file)) return none;

    // The file's own shape: validated by the schema at boot, so only the maps are read here.
    const parsed = parseYaml(readFileSync(file, 'utf8')) as unknown;
    if (!isPlainObject(parsed)) return none;

    const modulesRoot = path.join(repoRoot, 'src', 'modules');
    const removedSource = removedNames
        .map((name) => path.join(modulesRoot, name))
        .filter((folder) => existsSync(folder))
        .flatMap((folder) => sourceFiles(folder))
        .map((full) => readFileSync(full, 'utf8'));
    const keptSource = sourceFiles(path.join(repoRoot, 'src'))
        .filter((full) =>
            removedNames.every((name) => !full.startsWith(path.join(modulesRoot, name) + path.sep))
        )
        .map((full) => readFileSync(full, 'utf8'));

    const rowsOf = (section: Section): string[] => {
        const rows = parsed[section];
        return isPlainObject(rows) ? Object.keys(rows) : [];
    };
    const removedIn = (section: Section): string[] =>
        rowsOf(section).filter(
            (key) =>
                removedSource.some((source) => names(source, section, key)) &&
                keptSource.every((source) => !names(source, section, key))
        );
    const pages = Array.isArray(parsed.staticPages) ? (parsed.staticPages as unknown[]) : [];

    return {
        links: removedIn('links'),
        staffPages: removedIn('staffPages'),
        // A public page named after a removed module: `products` is the catalogue's own.
        staticPages: pages.filter(
            (page): page is string => typeof page === 'string' && removedNames.includes(page)
        )
    };
};

/**
 * Drop one map row's line from the YAML text, with the comment lines directly above it.
 * @param text - the file
 * @param section - the map the row sits in
 * @param key - the row's name, as the YAML spells it
 */
const dropRow = (text: string, section: Section, key: string): string => {
    const lines = text.split('\n');
    const start = lines.indexOf(`${section}:`);
    if (start === -1) return text;
    // The map ends at the next unindented, non-comment line.
    let end = lines.findIndex(
        (line, index) => index > start && /^\S/.test(line) && !line.startsWith('#')
    );
    if (end === -1) end = lines.length;
    const row = lines.findIndex(
        (line, index) => index > start && index < end && line.startsWith(`    ${key}:`)
    );
    if (row === -1) return text;

    let first = row;
    while (first - 1 > start && lines[first - 1].startsWith('    #')) first -= 1;
    lines.splice(first, row - first + 1);
    return lines.join('\n');
};

/**
 * Drop one static page from the YAML text.
 * @param text - the file
 * @param page - the entry
 */
const dropStaticPage = (text: string, page: string): string =>
    text.replace(new RegExp(String.raw`^    - ${page}\n`, 'm'), '');

/**
 * Drop one property from the schema text: its doc comment and its line, and a trailing comma the
 * new last property would be left with.
 * @param text - the schema file
 * @param key - the property
 */
const dropSchemaKey = (text: string, key: string): string =>
    text
        .replaceAll(
            new RegExp(String.raw`\n        /\*\* [^\n]*\*/\n        ${key}: template,?`, 'g'),
            ''
        )
        .replaceAll(/,(\n\s*\}\))/g, '$1');

/**
 * Edit the shared file and its schema.
 * @param repoRoot - the checkout to edit
 * @param rows - what {@link readRemovedLinkRows} found
 */
export const stripFrontendLinks = (repoRoot: string, rows: RemovedLinkRows): RemovalNote[] => {
    const dropped = [...rows.links, ...rows.staffPages];
    if (dropped.length === 0 && rows.staticPages.length === 0) return [];

    const file = path.join(repoRoot, LINKS_FILE);
    let text = readFileSync(file, 'utf8');
    for (const key of rows.links) text = dropRow(text, 'links', key);
    for (const key of rows.staffPages) text = dropRow(text, 'staffPages', key);
    for (const page of rows.staticPages) text = dropStaticPage(text, page);
    writeFileSync(file, text);

    const schema = path.join(repoRoot, SCHEMA_FILE);
    let schemaText = readFileSync(schema, 'utf8');
    for (const key of dropped) schemaText = dropSchemaKey(schemaText, key);
    writeFileSync(schema, schemaText);

    return [
        {
            file: LINKS_FILE,
            detail: `removed ${[...rows.links, ...rows.staffPages, ...rows.staticPages].join(', ')}`
        },
        { file: SCHEMA_FILE, detail: `removed ${dropped.join(', ')}` }
    ];
};
