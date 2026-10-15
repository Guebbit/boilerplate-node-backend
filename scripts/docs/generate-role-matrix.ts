#!/usr/bin/env tsx
/**
 * The EFFECTIVE role matrix in `docs/demo-ecommerce/index.md`: which rules a role actually holds,
 * per role, per module. Same shape as `generate-module-graph.ts` — markers in the page, prose around
 * them untouched, `--check` in `complete`.
 *
 * ONE TABLE, and only this one. What a role DECLARES is prose on the page, written by hand from
 * `shared/authorization-roles.yaml`'s own `title` and `description` — that file documents itself,
 * and a generated copy of its set lists said less than the descriptions it ignored.
 *
 * What it answers cannot be written by hand, which is why this survives: `admin` alone holds most
 * of the declared tenant sets, spelled out by name, and every signed-in caller is a customer first
 * (see `keysInScope` in `kernel/permissions.ts`). That is many cells nobody can derive reliably by
 * eye.
 *
 * Asked through `heldRules` rather than by re-expanding the sets here: a second expander is a
 * second answer to "what may this role do", and the one in the docs would be the one nobody runs.
 */

import path from 'node:path';
import {
    AUDIENCE_NAMES,
    IMPLIED_ACTIONS,
    PERMISSION_RULES,
    PRESET_ROLES,
    assembleCaller,
    keysInScope,
    type AudienceName
} from '@kernel/permissions';
import { heldRules } from '@kernel/ability';
import { applyMarkerBlocks } from './marker-block';
import type { AuthorizationScope, Caller } from '@types';
import { REPO_ROOT as ROOT } from '../modules-on-disk';

/** Report drift instead of rewriting the page — what `complete` runs. */
const checkOnly = process.argv.includes('--check');

/** The page the tables live in. */
const PAGE = path.join(ROOT, 'docs/demo-ecommerce/index.md');

const START = '<!-- role-matrix:start -->';
const END = '<!-- role-matrix:end -->';

/** One row of the table: a stored staff role (or none) and the audience the request is in. */
interface Persona {
    name: string;
    scope: AuthorizationScope;
    role: string | null;
    audience: AudienceName;
}

/**
 * The audience roles first, then the staff presets in the order the file declares them, each as a
 * verified account — a staff member is a customer too.
 *
 * `guest` and `unverified` are included though nobody holds them as a role: they are the baseline
 * every other row is measured against, and a reader comparing a role to "logged out" needs the
 * comparison in the same table. `system` is excluded: it is `admin`'s own permission list under an
 * alias (see `authorization-roles.yaml`), so its row would repeat `admin`'s exactly, and this page
 * documents roles an OPERATOR assigns — `system` is never one of them.
 */
const personas: Persona[] = [
    ...AUDIENCE_NAMES.map(
        (name): Persona => ({ name, scope: 'tenant', role: null, audience: name })
    ),
    ...PRESET_ROLES.filter((role) => role.name !== 'system').map(
        (role): Persona => ({
            name: role.name,
            scope: role.scope,
            role: role.name,
            audience: 'customer'
        })
    )
];

/** Every module that declares a rule, in declaration order — the table's columns. */
const modules = [...new Set(PERMISSION_RULES.map((rule) => rule.module))];

/**
 * The caller a persona resolves to, as the evaluator sees it.
 *
 * Built here rather than through `callerInScope`, which needs an `AuthContext` this script has no
 * request to build one from. The two agree on the part that matters — `permissions` — because both
 * read `keysInScope`.
 *
 * @param persona - the row to resolve
 */
const callerFor = (persona: Persona): Caller => {
    const permissions = keysInScope(persona.role, persona.scope, persona.audience);

    // Never `system` — this generates the DOCUMENTED role matrix, and `system` is not a role a
    // deployment assigns or a reader looks up by name.
    return assembleCaller(
        persona.audience === 'guest' ? null : 'generated',
        persona.scope === 'platform' ? null : 'generated',
        persona.scope,
        permissions
    );
};

/** One-letter action codes, so a ten-column table still fits a page. */
const codes: Record<string, string> = {
    read: 'r',
    create: 'c',
    update: 'u',
    delete: 'd',
    checkout: 'x',
    sweep: 's',
    override: 'o'
};

/**
 * What a role may do in one module: one code letter per action it holds, UPPERCASE when a rule
 * for it carries no condition (every row, not only the caller's own), lowercase when a condition
 * narrows it, and an em dash for nothing. A staff action also counts for the plain ones it
 * implies: `display` shows as `R`.
 */
const cell = (caller: Caller, module: string): string => {
    const heldByCaller = heldRules(caller);
    const held = PERMISSION_RULES.filter(
        (rule) => rule.module === module && heldByCaller.has(rule.id)
    );

    if (held.length === 0) return '—';

    const actionsOf = (rule: (typeof held)[number]): string[] => [
        rule.action,
        ...(IMPLIED_ACTIONS[rule.action] ?? [])
    ];
    const wide = new Set(
        held.filter((rule) => rule.conditions === undefined).flatMap((rule) => actionsOf(rule))
    );

    return [...new Set(held.flatMap((rule) => actionsOf(rule)))]
        .map((action) => {
            const code = codes[action] ?? action;

            return wide.has(action) ? code.toUpperCase() : code;
        })
        .join('');
};

/** The effective table: which rules `heldRules` answers, per module. */
const effectiveTable = (): string =>
    [
        `| Role | ${modules.join(' | ')} |`,
        `| --- |${' --- |'.repeat(modules.length)}`,
        ...personas.map((persona) => {
            const caller = callerFor(persona);

            return `| \`${persona.name}\` | ${modules
                .map((module) => cell(caller, module))
                .join(' | ')} |`;
        })
    ].join('\n');

/** The table and its legend, as the block that replaces whatever sits between the markers. */
const body = (): string =>
    [
        'The roles above after the evaluator has had them, the `customer` audience folded into every',
        'signed-in row. This is what a route guard and a listing actually answer.',
        '',
        effectiveTable(),
        '',
        'UPPERCASE — a rule with no condition, every row · lowercase — narrowed to the caller’s own or the published rows · ' +
            '`r` read · `c` create · `u` update · `d` delete · `x` checkout · `s` sweep · ' +
            '`o` override · — nothing',
        '',
        'Read down a column to see who touches one part of the shop; read across a row to see one',
        'person’s whole job. `operator` is the only row outside the shop entirely: it runs the',
        'installation and reads no shop’s rows, which is why its row is empty everywhere else and',
        'why `admin` — unrestricted **inside one shop** — cannot reach observability either.'
    ].join('\n');

void applyMarkerBlocks({
    file: PAGE,
    root: ROOT,
    blocks: [{ start: START, end: END, body: body() }],
    label: 'role-matrix',
    checkOnly,
    driftSubject: 'the permission model',
    rerunScript: 'docs:roles'
}).then((code) => {
    process.exitCode = code;
});
