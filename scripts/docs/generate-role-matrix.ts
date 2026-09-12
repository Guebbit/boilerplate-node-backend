#!/usr/bin/env tsx
/**
 * The EFFECTIVE role matrix in `docs/demo-ecommerce/index.md`: what `holdsKey` actually answers,
 * per role, per module. Same shape as `generate-module-graph.ts` — markers in the page, prose
 * around them untouched, `--check` in `complete`.
 *
 * ONE TABLE, and only this one. What a role DECLARES is prose on the page, written by hand from
 * `shared/authorization-roles.yaml`'s own `title` and `description` — that file documents itself,
 * and a generated copy of its key lists said less than the descriptions it ignored.
 *
 * What it answers cannot be written by hand, which is why this survives: `manage` expands into its
 * module's concrete keys, and every tenant caller is floored at the anonymous baseline (see
 * `keysInScope` in `kernel/permissions.ts`). That is 117 cells nobody can derive reliably by eye.
 *
 * Asked through `holdsKey` rather than by re-expanding the keys here: a second expander is a
 * second answer to "what may this role do", and the one in the docs would be the one nobody runs.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { format, resolveConfig } from 'prettier';
import {
    ANONYMOUS_ROLE,
    PERMISSION_KEYS,
    PRESET_ROLES,
    permissionsOfRole
} from '@kernel/permissions';
import { holdsKey } from '@kernel/ability';
import type { AuthorizationScope, Caller } from '@types';

/** Report drift instead of rewriting the page — what `complete` runs. */
const checkOnly = process.argv.includes('--check');

/** Repo root, two levels up from `scripts/docs/`. */
const ROOT = path.join(__dirname, '../..');

/** The page the tables live in. */
const PAGE = path.join(ROOT, 'docs/demo-ecommerce/index.md');

const START = '<!-- role-matrix:start -->';
const END = '<!-- role-matrix:end -->';

/**
 * `guest` first, then the presets in the order the file declares them.
 *
 * `guest` is included though nobody logs in as it: it is the baseline every other row is now
 * measured against, and a reader comparing a role to "logged out" needs the comparison in the
 * same table.
 */
const roles = [ANONYMOUS_ROLE, ...PRESET_ROLES];

/** Every module that declares a key, in declaration order — the table's columns. */
const modules = [...new Set(PERMISSION_KEYS.map((key) => key.module))];

/**
 * The caller a role resolves to, as the evaluator sees it.
 *
 * Built here rather than through `callerInScope`, which needs an `AuthContext` this script has no
 * request to build one from. The two agree on the part that matters — `permissions` — because both
 * read `permissionsOfRole`; the baseline union is applied below for the same reason the kernel
 * applies it.
 *
 * @param name - the role name
 * @param scope - the scope that role belongs to
 */
const callerFor = (name: string, scope: AuthorizationScope): Caller => {
    const id = name === ANONYMOUS_ROLE.name ? null : 'generated';
    const permissions =
        scope === ANONYMOUS_ROLE.scope
            ? [...new Set([...permissionsOfRole(name), ...ANONYMOUS_ROLE.permissions])]
            : permissionsOfRole(name);

    return scope === 'platform'
        ? { id, tenantId: null, scope, permissions }
        : { id, tenantId: 'generated', scope, permissions };
};

/** One-letter action codes, so a ten-column table still fits a page. */
const codes: Record<string, string> = {
    read: 'r',
    create: 'c',
    update: 'u',
    delete: 'd'
};

/**
 * What a role may do in one module: `all` when it holds that module's wildcard, the action codes
 * it holds otherwise, and an em dash for nothing.
 */
const cell = (caller: Caller, module: string): string => {
    const held = PERMISSION_KEYS.filter(
        (key) => key.module === module && holdsKey(caller, key.key)
    );

    if (held.length === 0) return '—';
    if (held.some((key) => key.action === 'manage')) return '**all**';

    return held.map((key) => codes[key.action] ?? key.action).join('');
};

/** The effective table: what `holdsKey` answers, per module. */
const effectiveTable = (): string =>
    [
        `| Role | ${modules.join(' | ')} |`,
        `| --- |${' --- |'.repeat(modules.length)}`,
        ...roles.map((role) => {
            const caller = callerFor(role.name, role.scope);

            return `| \`${role.name}\` | ${modules
                .map((module) => cell(caller, module))
                .join(' | ')} |`;
        })
    ].join('\n');

/** The table and its legend, as the block that replaces whatever sits between the markers. */
const body = (): string =>
    [
        'The roles above after the evaluator has had them: `manage` expanded into its module’s own',
        'keys, and the `guest` baseline folded in. This is what a route guard and a listing',
        'actually answer.',
        '',
        effectiveTable(),
        '',
        '**all** — every key that module declares · `r` read · `c` create · `u` update · `d` delete · — nothing',
        '',
        'Read down a column to see who touches one part of the shop; read across a row to see one',
        'person’s whole job. `operator` is the only row outside the shop entirely: it runs the',
        'installation and reads no shop’s rows, which is why its row is empty everywhere else and',
        'why `owner` — unrestricted **inside one shop** — cannot reach observability either.'
    ].join('\n');

/**
 * Write the block into the page, or report that it drifted.
 *
 * Formatted before comparing or writing, for the reason `generate-module-graph.ts` gives: `complete`
 * also runs `prettier --check` over `docs/`, and an unformatted block would leave the two checks
 * demanding different bytes from one file.
 *
 * @returns the process exit code
 */
const apply = async (): Promise<number> => {
    const label = path.relative(ROOT, PAGE);
    const page = readFileSync(PAGE, 'utf8');
    const from = page.indexOf(START);
    const to = page.indexOf(END);

    if (from === -1 || to === -1) {
        console.error(`[role-matrix] markers ${START} / ${END} not found in ${label}`);
        return 1;
    }

    const next = await format(
        `${page.slice(0, from + START.length)}\n\n${body()}\n\n${page.slice(to)}`,
        { ...(await resolveConfig(PAGE)), filepath: PAGE }
    );

    if (next === page) return 0;

    if (checkOnly) {
        console.error(
            `[role-matrix] ${label} is out of date with the permission model.\n` +
                '              Run `npm run docs:roles` and commit the result.'
        );
        return 1;
    }

    writeFileSync(PAGE, next);
    console.log(`[role-matrix] ${label} updated.`);
    return 0;
};

void apply().then((code) => {
    process.exitCode = code;
});
