#!/usr/bin/env tsx
/**
 * The EFFECTIVE role matrix in `docs/demo-ecommerce/index.md`: which rules a role actually holds,
 * per role, per module — and, on every module's own page, the "who can do what" table of that
 * module's rules. Same shape as `generate-module-graph.ts` — markers in the page, prose around
 * them untouched, `--check` in `complete`.
 *
 * ONE TABLE per page, and only generated ones. What a role DECLARES is prose on the page, written by hand from
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
    PERMISSION_SETS,
    PRESET_ROLES,
    assembleCaller,
    keysInScope,
    type AudienceName
} from '@kernel/permissions';
import { heldRules } from '@kernel/ability';
import { applyMarkerBlocks } from './marker-block';
import type { AuthorizationScope, Caller } from '@types';
import { REPO_ROOT as ROOT } from '../modules-on-disk';
import { hasFlag } from '../cli';

/** Report drift instead of rewriting the page — what `complete` runs. */
const checkOnly = hasFlag('check');

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

/** The marker pair a module page carries around its generated "who can do what" table. */
const MODULE_START = '<!-- permissions:start -->';
const MODULE_END = '<!-- permissions:end -->';

/**
 * The docs page of a module's rules. `core`'s translation rules are documented with the locales
 * that carry them; `example` has no page by design (it exists to be copied).
 *
 * @param module - the `module` a rule declares
 * @returns the page's name under `docs/modules/`, or `undefined` when the module has none
 */
const pageOf = (module: string): string | undefined => {
    if (module === 'example') return undefined;

    return module === 'core' ? 'locales' : module;
};

/** The modules whose rules a page documents, keyed by that page. */
const modulesByPage = (): Map<string, string[]> => {
    const pages = new Map<string, string[]>();

    for (const module of modules) {
        const page = pageOf(module);
        if (page !== undefined) pages.set(page, [...(pages.get(page) ?? []), module]);
    }

    return pages;
};

/** How a step-up tier is written in a cell: critical or sensitive. */
const STEP_UP_MARKS = { critical: ' ⚡c', sensitive: ' ⚡s' } as const;

/**
 * One persona's cell for one rule: a tick when the persona holds it, `own` when a condition pins it
 * to the caller's own rows, and the step-up tier when the rule demands a freshly proved session.
 *
 * @param rule - the rule asked about
 * @param caller - the persona's resolved caller
 */
const ruleCell = (rule: (typeof PERMISSION_RULES)[number], caller: Caller): string => {
    if (!heldRules(caller).has(rule.id)) return '—';

    const own = JSON.stringify(rule.conditions ?? {}).includes('$caller') ? ' own' : '';
    const tier = rule.stepUp === undefined ? '' : STEP_UP_MARKS[rule.stepUp];

    return `✅${own}${tier}`;
};

/**
 * The "who can do what" block for a page: one row per rule of its modules, the sets that bundle
 * it, and one column per role as the evaluator answers it.
 *
 * @param pageModules - the modules whose rules the page documents
 */
const moduleBody = (pageModules: readonly string[]): string => {
    const callers = personas.map((persona) => callerFor(persona));
    const rows = PERMISSION_RULES.filter((rule) => pageModules.includes(rule.module)).map(
        (rule) => {
            const sets = PERMISSION_SETS.filter((set) => set.rules.includes(rule.id))
                .map((set) => `\`${set.name}\``)
                .join(', ');
            const credential =
                rule.scope === 'tenant' && rule.stepUp === undefined && rule.credential !== false
                    ? '✅'
                    : '—';

            return `| \`${rule.id}\` | ${sets} | ${callers
                .map((caller) => ruleCell(rule, caller))
                .join(' | ')} | ${credential} | ${rule.description} |`;
        }
    );

    return [
        `| Rule | Set | ${personas.map((persona) => `\`${persona.name}\``).join(' | ')} | Credential | What it lets them do |`,
        `| --- | --- |${' --- |'.repeat(personas.length + 1)} --- |`,
        ...rows,
        '',
        '✅ held · `own` only the caller’s own rows · ⚡c / ⚡s needs a freshly proved session (critical / sensitive) ·',
        'Credential: ✅ when an API key can be minted with the rule. Generated from the rules and sets in',
        '`src/modules/*/authorization.yaml` and the roles in `shared/authorization-roles.yaml`, asked of the',
        'evaluator — [Authorization](../theory/authorization.md) explains the model.'
    ].join('\n');
};

/** Every page this script owns a block on, matrix first. */
const pages = [
    { file: PAGE, blocks: [{ start: START, end: END, body: body() }], label: 'role-matrix' },
    ...[...modulesByPage()].map(([page, pageModules]) => ({
        file: path.join(ROOT, 'docs', 'modules', `${page}.md`),
        blocks: [{ start: MODULE_START, end: MODULE_END, body: moduleBody(pageModules) }],
        label: `role-matrix:${page}`
    }))
];

/**
 * Writes (or checks) every page in turn, so one stale page does not hide another.
 *
 * @returns the worst exit code any page answered
 */
const run = async (): Promise<number> => {
    let worst = 0;

    for (const page of pages) {
        const code = await applyMarkerBlocks({
            ...page,
            root: ROOT,
            checkOnly,
            driftSubject: 'the permission model'
        });
        worst = Math.max(worst, code);
    }

    return worst;
};

void run().then((code) => {
    process.exitCode = code;
});
