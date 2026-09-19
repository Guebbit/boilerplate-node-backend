#!/usr/bin/env tsx
/**
 * The EFFECTIVE role matrix in `docs/demo-ecommerce/index.md`: which keys a role actually holds,
 * per role, per module. Same shape as `generate-module-graph.ts` — markers in the page, prose
 * around them untouched, `--check` in `complete`.
 *
 * ONE TABLE, and only this one. What a role DECLARES is prose on the page, written by hand from
 * `shared/authorization-roles.yaml`'s own `title` and `description` — that file documents itself,
 * and a generated copy of its key lists said less than the descriptions it ignored.
 *
 * What it answers cannot be written by hand, which is why this survives: `admin` alone holds over
 * forty keys, spelled out by name, and every tenant caller is floored at the anonymous baseline
 * (see `keysInScope` in `kernel/permissions.ts`). That is many cells nobody can derive reliably by
 * eye.
 *
 * Asked through `heldKeys` rather than by re-expanding the keys here: a second expander is a
 * second answer to "what may this role do", and the one in the docs would be the one nobody runs.
 * Not `holdsKey`: that collapses two keys sharing an action and a subject but differing in
 * breadth into one yes/no, which is right for a route guard and wrong for enumerating exactly
 * which keys a role holds.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { format, resolveConfig } from 'prettier';
import {
    ANONYMOUS_ROLE,
    PERMISSION_KEYS,
    PRESET_ROLES,
    permissionsOfRole,
    isUnrestricted
} from '@kernel/permissions';
import { heldKeys } from '@kernel/ability';
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

    const unrestricted = isUnrestricted({ scope, permissions });

    return scope === 'platform'
        ? { id, tenantId: null, scope, permissions, unrestricted }
        : { id, tenantId: 'generated', scope, permissions, unrestricted };
};

/** One-letter action codes, so a ten-column table still fits a page. */
const codes: Record<string, string> = {
    read: 'r',
    create: 'c',
    update: 'u',
    delete: 'd',
    checkout: 'x',
    sweep: 's'
};

/** The breadth segment of a key — always the one before its action. `orders.any.read` is `any`. */
const breadthOf = (key: string): string => key.split('.').at(-2) ?? '';

/**
 * What a role may do in one module: one code letter per action it holds, UPPERCASE when the
 * caller holds the `any`-breadth key for it (every row, not only their own), lowercase for `self`,
 * and an em dash for nothing.
 */
const cell = (caller: Caller, module: string): string => {
    const heldByCaller = heldKeys(caller);
    const held = PERMISSION_KEYS.filter(
        (key) => key.module === module && heldByCaller.has(key.key)
    );

    if (held.length === 0) return '—';

    const wide = new Set(
        held.filter((key) => breadthOf(key.key) === 'any').map((key) => key.action)
    );

    return [...new Set(held.map((key) => key.action))]
        .map((action) => {
            const code = codes[action] ?? action;

            return wide.has(action) ? code.toUpperCase() : code;
        })
        .join('');
};

/** The effective table: which keys `heldKeys` answers, per module. */
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
        'The roles above after the evaluator has had them, the `guest` baseline folded in. This is',
        'what a route guard and a listing actually answer.',
        '',
        effectiveTable(),
        '',
        'UPPERCASE — the `any`-breadth key, every row · lowercase — `self`, the caller’s own · ' +
            '`r` read · `c` create · `u` update · `d` delete · `x` checkout · `s` sweep · — nothing',
        '',
        'Read down a column to see who touches one part of the shop; read across a row to see one',
        'person’s whole job. `operator` is the only row outside the shop entirely: it runs the',
        'installation and reads no shop’s rows, which is why its row is empty everywhere else and',
        'why `admin` — unrestricted **inside one shop** — cannot reach observability either.'
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
