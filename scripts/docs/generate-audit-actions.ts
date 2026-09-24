#!/usr/bin/env tsx
/**
 * The audit action reference table in `docs/tools/winston.md`. Same shape as
 * `generate-role-matrix.ts`: markers in the page, prose around them untouched, `--check` in
 * `complete`.
 *
 * Replaces the 7 per-module `tests/unit/audit.test.ts` files that each pinned their own module's
 * action strings by hand, restating `audit.ts` rather than testing anything: a renamed or added
 * action now shows up as a diff in this committed, reviewed page instead — the doc IS the
 * regression guard. `tests/cross-cutting/audit-actions.test.ts` still checks the STRUCTURE
 * (uniqueness, the dotted convention, every module accounted for); this page is the vocabulary
 * itself.
 *
 * Every action's owner and wire value come from the same source that cross-cutting test trusts:
 * each module's own `audit.ts`, imported for real, plus infrastructure's three `security.*`
 * actions. `target_type` is not declared anywhere near an action — it is a free string passed at
 * each `recordAudit`/`emitAuditEvent`/`buildAuditEvent` call site — so it is read off the call
 * site's own text instead, the same trade-off `generate-module-graph.ts`'s `readEventEdges` makes
 * for event subscriptions: `—` where no call site names one (the three `security.*` actions have
 * no object to attach to), `(varies)` where the same action fires against more than one literal
 * target (a generic helper like `upsertEntityTranslations` takes the entity type as a parameter).
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { coreAuditActions } from '@infrastructure/observability/audit';
import { applyMarkerBlocks } from './marker-block';

/** Report drift instead of rewriting the page — what `complete` runs. */
const checkOnly = process.argv.includes('--check');

/** Repo root, two levels up from `scripts/docs/`. */
const ROOT = path.join(__dirname, '..', '..');

/** Every module folder under `src/modules`. */
const MODULES_ROOT = path.join(ROOT, 'src', 'modules');

/** The page the table lives in, right where the vocabulary is already described in prose. */
const PAGE = path.join(ROOT, 'docs', 'tools', 'winston.md');

const START = '<!-- audit-actions:start -->';
const END = '<!-- audit-actions:end -->';

/** One declared action, before its call sites have been read for a target type. */
interface DeclaredAction {
    /** The module that declares it, or `infrastructure` for the three app-level ones. */
    owner: string;
    /** The exported map's own name, e.g. `accountAuditActions` — how call sites refer to it. */
    varName: string;
    /** The constant's key, e.g. `AUTH_LOGIN`. */
    key: string;
    /** The wire string, e.g. `auth.login`. */
    value: string;
}

/** A {@link DeclaredAction} plus what its call sites were found to audit. */
interface AuditActionRow extends DeclaredAction {
    targetType: string;
}

/** Every `.ts` file under `directory`, skipping `tests/` — same walk `generate-dependency-map.ts` uses. */
const walk = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return entry.name === 'tests' ? [] : walk(full);
        return entry.name.endsWith('.ts') ? [full] : [];
    });

/**
 * The action map a module's own `audit.ts` exports — imported for real, like
 * `tests/cross-cutting/audit-actions.test.ts`'s own `readActions`, so a module that fails to load
 * fails this generator instead of silently contributing nothing. The export's name varies per
 * module, so it is found by shape (an object whose values are all strings) rather than guessed.
 * @param file - absolute path to the module's `audit.ts`
 */
const readModuleActions = async (
    file: string
): Promise<Pick<DeclaredAction, 'varName'> & { actions: Record<string, string> }> => {
    const loaded = (await import(file)) as Record<string, unknown>;
    const entry = Object.entries(loaded).find(
        ([, value]) =>
            typeof value === 'object' &&
            value !== null &&
            Object.values(value).every((member) => typeof member === 'string')
    );
    return { varName: entry?.[0] ?? '', actions: (entry?.[1] ?? {}) as Record<string, string> };
};

/** Every action this build can emit: infrastructure's three, plus every module's own. */
const collectDeclaredActions = async (): Promise<DeclaredAction[]> => {
    const infrastructureActions = Object.entries(coreAuditActions).map(([key, value]) => ({
        owner: 'infrastructure',
        varName: 'coreAuditActions',
        key,
        value
    }));

    const moduleActions = await Promise.all(
        readdirSync(MODULES_ROOT).map(async (moduleName) => {
            const file = path.join(MODULES_ROOT, moduleName, 'audit.ts');
            if (!existsSync(file)) return [];
            const { varName, actions } = await readModuleActions(file);
            return Object.entries(actions).map(([key, value]) => ({
                owner: moduleName,
                varName,
                key,
                value
            }));
        })
    );

    return [...infrastructureActions, ...moduleActions.flat()];
};

/**
 * How far either side of an `owner.KEY` reference to look for the same object literal's target
 * field. Two shapes both fit inside it: an ordinary `recordAudit` call, where `target_type:`
 * follows the action a few lines later; and the shared `createDeleteController` spec, where
 * `entity:` — its own docblock: "used for the audit target_type" — sits a few lines BEFORE the
 * `auditAction:` that names this identifier. A third shape, an action chosen by a same-file helper
 * (`auditActionForUpdate` in `users/service.ts`) and read back at a call site further away than
 * this window, is left as "not discoverable" rather than risking a wrong attribution from a wider
 * search.
 */
const TARGET_WINDOW = 300;

/**
 * Either spelling a call site uses for what it acted on — see {@link TARGET_WINDOW}. One capture
 * group covering both quote styles, rather than one per style: a call site's target is always a
 * plain lower-case word, so the looser `[^'"]*` never has to worry about a quote inside the value.
 */
const TARGET_FIELD = /(?:target_type|entity):\s*["']([^"']*)["']/;

/** Every literal target a given `owner.KEY` identifier is fired against, across `src/`. */
const targetTypesOf = (identifier: string, sources: readonly string[]): Set<string> => {
    const pattern = new RegExp(String.raw`\b${identifier.replaceAll('.', String.raw`\.`)}\b`, 'g');
    const found = new Set<string>();

    for (const source of sources)
        for (const match of source.matchAll(pattern)) {
            const window = source.slice(
                Math.max(0, match.index - TARGET_WINDOW),
                match.index + identifier.length + TARGET_WINDOW
            );
            const targetMatch = TARGET_FIELD.exec(window);
            if (targetMatch) found.add(targetMatch[1]);
        }

    return found;
};

/** The table cell for a set of discovered target types — see the header comment for the two edge cases. */
const targetTypeCell = (types: Set<string>): string => {
    if (types.size === 0) return '—';
    if (types.size === 1) return `\`${[...types][0]}\``;
    return `(varies: ${[...types]
        .toSorted()
        .map((type) => `\`${type}\``)
        .join(', ')})`;
};

/** The reference table: one row per action, sorted so a rename is the only diff it ever produces. */
const actionTable = (rows: readonly AuditActionRow[]): string =>
    [
        '| Module | Action | Value | Target type |',
        '| --- | --- | --- | --- |',
        ...rows
            .toSorted((a, b) => a.owner.localeCompare(b.owner) || a.key.localeCompare(b.key))
            .map(
                (row) =>
                    `| \`${row.owner}\` | \`${row.key}\` | \`${row.value}\` | ${row.targetType} |`
            )
    ].join('\n');

/** Reads every declared action, discovers its call sites' target types, and writes the page. */
const main = async (): Promise<void> => {
    const declared = await collectDeclaredActions();
    const sources = walk(path.join(ROOT, 'src')).map((file) => readFileSync(file, 'utf8'));
    const rows: AuditActionRow[] = declared.map((action) => ({
        ...action,
        targetType: targetTypeCell(targetTypesOf(`${action.varName}.${action.key}`, sources))
    }));

    process.exitCode = await applyMarkerBlocks({
        file: PAGE,
        root: ROOT,
        blocks: [{ start: START, end: END, body: actionTable(rows) }],
        label: 'audit-actions',
        checkOnly,
        driftSubject: 'the audit vocabulary',
        rerunScript: 'docs:audit-actions'
    });
};

void main();
