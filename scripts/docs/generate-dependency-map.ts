#!/usr/bin/env tsx
/**
 * The two tables in `docs/tools/package-dependencies.md`: every `package.json` dependency, grouped
 * by what it's for, and — for anything `./dependency-groups.ts` doesn't claim — which single module
 * imports it. Same shape as `generate-role-matrix.ts`: markers in the page, prose around them
 * untouched, `--check` in `complete`.
 *
 * WHAT IS DERIVED, always: the package list itself, and who imports each one — scanned from
 * `src/`, `scenarios/`, `scripts/`, `db/` and the root tool configs, `tests/` excluded throughout.
 * A hand-kept copy of either one is a published number with no guard behind it; the previous,
 * hand-written page missed 32 of 99 packages and still listed 3 that were gone.
 *
 * WHAT IS HAND-KEPT: the group a package belongs to and its one-line purpose, in
 * `./dependency-groups.ts`. A package that group doesn't claim, and that exactly one module
 * imports, needs no hand entry at all — ownership is what's derived, so it's listed under that
 * module automatically. Anything left over — no group, no single owner — lands in "Ungrouped":
 * visible, not a build failure, per `docs/theory/modules.md`'s "less policing" stance.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { format, resolveConfig } from 'prettier';
import {
    DEV_GROUPS,
    RUNTIME_GROUPS,
    matchesGroup,
    type DependencyGroup
} from './dependency-groups';

/** Report drift instead of rewriting the page — what `complete` runs. */
const checkOnly = process.argv.includes('--check');

/** Repo root, two levels up from `scripts/docs/`. */
const ROOT = path.join(__dirname, '..', '..');

/** The page both generated blocks live in. */
const PAGE = path.join(ROOT, 'docs', 'tools', 'package-dependencies.md');

const RUNTIME_START = '<!-- dependency-map:runtime:start -->';
const RUNTIME_END = '<!-- dependency-map:runtime:end -->';
const DEV_START = '<!-- dependency-map:dev:start -->';
const DEV_END = '<!-- dependency-map:dev:end -->';

/** Top-level directories holding production code — the only places ownership is read from. */
const SCAN_DIRECTORIES = ['src', 'scenarios', 'scripts', 'db'];

/** Root-level tool configs that import packages no production directory does. */
const SCAN_FILES = [
    'eslint.config.ts',
    'orval.config.ts',
    'jest.config.js',
    'jest.config.cluster.js',
    '.dependency-cruiser.cjs'
];

/** Path aliases from `tsconfig.json` — never a package, however much they look like one. */
const ALIAS_PREFIXES = [
    '@types',
    '@api/',
    '@tests/',
    '@app/',
    '@infrastructure/',
    '@kernel/',
    '@modules/',
    '@scenarios/'
];

/** `package.json`'s two dependency maps — just the names; versions play no part here. */
interface PackageManifest {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
}

const readManifest = (): PackageManifest =>
    JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as PackageManifest;

/** Every source file under `directory`, skipping any `tests/` folder and `.test.`/`.spec.` file. */
const walk = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return entry.name === 'tests' ? [] : walk(full);
        if (!/\.[cm]?[jt]s$/.test(entry.name)) return [];
        if (/\.(test|spec)\.[cm]?[jt]s$/.test(entry.name)) return [];
        return [full];
    });

/**
 * Where one production file lives, coarsened to the level ownership is decided at: one module, or
 * a shared area. `src/modules/<name>/**` is the only tier fine enough to name a single owner.
 */
const ownerOf = (file: string): string => {
    const relativePath = path.relative(ROOT, file).replaceAll(path.sep, '/');
    const moduleMatch = /^src\/modules\/([^/]+)\//.exec(relativePath);
    if (moduleMatch) return `module:${moduleMatch[1]}`;
    if (relativePath.startsWith('src/kernel/')) return 'kernel';
    if (relativePath.startsWith('src/infrastructure/')) return 'infrastructure';
    if (relativePath.startsWith('scenarios/')) return 'scenarios';
    if (relativePath.startsWith('scripts/')) return 'scripts';
    if (relativePath.startsWith('db/')) return 'db';
    return 'app';
};

/**
 * Every `from "<specifier>"` / `require("<specifier>")` target in one file, external packages
 * only — a relative or `@`-aliased path (`@modules/*`, `@kernel/*`, …) is never a dependency.
 */
const importSpecifiers = (source: string): string[] =>
    [...source.matchAll(/(?:from\s+|require\()\s*["']([^"']+)["']/g)]
        .map((match) => match[1])
        .filter(
            (specifier) =>
                !specifier.startsWith('.') &&
                !ALIAS_PREFIXES.some(
                    (prefix) => specifier === prefix || specifier.startsWith(prefix)
                )
        );

/** Package name a specifier resolves to: itself, if it's an exact or subpath match. */
const packageFor = (specifier: string, packages: string[]): string | undefined =>
    packages.find((name) => specifier === name || specifier.startsWith(`${name}/`));

/** Every scanned package name mapped to the set of areas that import it, production code only. */
const readOwnership = (packages: string[]): Map<string, Set<string>> => {
    const files = [
        ...SCAN_DIRECTORIES.flatMap((directory) => walk(path.join(ROOT, directory))),
        ...SCAN_FILES.map((file) => path.join(ROOT, file))
    ];
    const ownership = new Map<string, Set<string>>();

    for (const file of files) {
        const source = readFileSync(file, 'utf8');
        const owner = ownerOf(file);
        for (const specifier of importSpecifiers(source)) {
            const packageName = packageFor(specifier, packages);
            if (!packageName) continue;
            ownership.set(packageName, ownership.get(packageName) ?? new Set());
            ownership.get(packageName)?.add(owner);
        }
    }

    return ownership;
};

/** The one module owning a package, if its only importer is a single `src/modules/<name>/`. */
const soleModuleOwner = (owners: Set<string> | undefined): string | undefined => {
    if (owners?.size !== 1) return undefined;
    const [only] = owners;
    return only.startsWith('module:') ? only.slice('module:'.length) : undefined;
};

/** One row of the generated table: a hand-kept group, or a package with no group and one owner. */
interface Row {
    group: string;
    packages: string;
    purpose: string;
    readMore: string;
}

/** The hand-kept groups that actually have a package present in this half of `package.json`. */
const groupRows = (packages: string[], groups: DependencyGroup[]): Row[] =>
    groups
        .map((group) => ({
            group: group.name,
            packages: packages
                .filter((packageName) => matchesGroup(packageName, group.match))
                .map((packageName) => `\`${packageName}\``)
                .join(', '),
            purpose: group.purpose,
            readMore: group.readMore
        }))
        .filter((row) => row.packages !== '');

/** Packages no hand group claims, each imported by exactly one module — one row per module. */
const moduleOwnedRow = (
    packages: string[],
    groups: DependencyGroup[],
    ownership: Map<string, Set<string>>
): Row | undefined => {
    const owned = packages
        .filter((packageName) => !groups.some((group) => matchesGroup(packageName, group.match)))
        .map((packageName) => ({
            packageName,
            module: soleModuleOwner(ownership.get(packageName))
        }))
        .filter(
            (entry): entry is { packageName: string; module: string } => entry.module !== undefined
        )
        .toSorted(
            (a, b) => a.module.localeCompare(b.module) || a.packageName.localeCompare(b.packageName)
        );

    if (owned.length === 0) return undefined;

    return {
        group: 'Owned by a module',
        packages: owned
            .map(({ packageName, module }) => `\`${packageName}\` (${module})`)
            .join(', '),
        purpose:
            'each imported by exactly one module — its own page under `docs/modules/` says why',
        readMore: [...new Set(owned.map((entry) => entry.module))]
            .map((module) => `[${module}](../modules/${module}.md)`)
            .join(', ')
    };
};

/** Packages with no hand group and no single owner: shared, but nobody described why yet. */
const ungroupedTable = (
    packages: string[],
    groups: DependencyGroup[],
    ownership: Map<string, Set<string>>
): string => {
    const leftover = packages.filter(
        (packageName) =>
            !groups.some((group) => matchesGroup(packageName, group.match)) &&
            !soleModuleOwner(ownership.get(packageName))
    );
    if (leftover.length === 0) return '';

    return [
        '',
        '### Ungrouped',
        '',
        'Nobody has said why these are here yet — add a row to `./dependency-groups.ts`, or a case',
        'to `./generate-dependency-map.ts` if the ownership rule itself is missing something.',
        '',
        '| Package | Imported from |',
        '| --- | --- |',
        ...leftover
            .toSorted()
            .map(
                (packageName) =>
                    `| \`${packageName}\` | ${[...(ownership.get(packageName) ?? [])].toSorted().join(', ') || '—'} |`
            )
    ].join('\n');
};

/** One half of the page — Runtime or Dev — as the markdown table plus any ungrouped leftovers. */
const renderTable = (
    packages: string[],
    groups: DependencyGroup[],
    ownership: Map<string, Set<string>>
): string => {
    const rows = groupRows(packages, groups);
    const moduleRow = moduleOwnedRow(packages, groups, ownership);

    return [
        '| Group | Packages | Why they exist here | Read more |',
        '| --- | --- | --- | --- |',
        ...[...rows, ...(moduleRow ? [moduleRow] : [])].map(
            (row) => `| ${row.group} | ${row.packages} | ${row.purpose} | ${row.readMore} |`
        ),
        ungroupedTable(packages, groups, ownership)
    ]
        .filter((line) => line !== '')
        .join('\n');
};

/** A generated block and the page it belongs in. */
interface Target {
    start: string;
    end: string;
    body: string;
}

/** Writes every block into the page in one pass, or reports drift. */
const apply = async (): Promise<number> => {
    const manifest = readManifest();
    const runtime = Object.keys(manifest.dependencies ?? {}).toSorted();
    const development = Object.keys(manifest.devDependencies ?? {}).toSorted();
    const ownership = readOwnership([...runtime, ...development]);

    const targets: Target[] = [
        {
            start: RUNTIME_START,
            end: RUNTIME_END,
            body: renderTable(runtime, RUNTIME_GROUPS, ownership)
        },
        { start: DEV_START, end: DEV_END, body: renderTable(development, DEV_GROUPS, ownership) }
    ];

    const label = path.relative(ROOT, PAGE);
    let page = readFileSync(PAGE, 'utf8');

    for (const { start, end, body } of targets) {
        const from = page.indexOf(start);
        const to = page.indexOf(end);
        if (from === -1 || to === -1) {
            console.error(`[dependency-map] markers ${start} / ${end} not found in ${label}`);
            return 1;
        }
        page = `${page.slice(0, from + start.length)}\n\n${body}\n\n${page.slice(to)}`;
    }

    /*
     * Formatted before it is compared or written. `prettier --check` runs over `docs/` in
     * `complete` too, so an unformatted block would leave the two checks demanding different bytes
     * from the same file.
     */
    const original = readFileSync(PAGE, 'utf8');
    const next = await format(page, { ...(await resolveConfig(PAGE)), filepath: PAGE });

    if (next === original) return 0;

    if (checkOnly) {
        console.error(
            `[dependency-map] ${label} is out of date with package.json and the source tree.\n` +
                '                 Run `npm run docs:dependencies` and commit the result.'
        );
        return 1;
    }

    writeFileSync(PAGE, next);
    console.log(`[dependency-map] ${label} updated.`);
    return 0;
};

void apply().then((code) => {
    process.exitCode = code;
});
