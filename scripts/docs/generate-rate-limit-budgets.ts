#!/usr/bin/env tsx
/**
 * The rate-limit budget table in `docs/tools/security.md`. Same shape as
 * `generate-role-matrix.ts`: markers in the page, prose around them untouched, `--check` in
 * `complete`.
 *
 * ONE TABLE, generated because a hand-maintained one goes stale silently: a budget's default,
 * window or env var changing in code is invisible here until someone remembers to also edit the
 * doc. Reading `RateLimitBudget` data straight off every module's manifest, plus
 * `INFRASTRUCTURE_RATE_LIMITS`, is the same list `tests/cross-cutting/rate-limit-budgets.test.ts`
 * checks for internal consistency — this script trusts that test to have already run in `complete`.
 */

import path from 'node:path';
import { enabledModules } from '../../src/modules';
import { resolveRateLimits } from '@kernel/registry';
import { INFRASTRUCTURE_RATE_LIMITS } from '@infrastructure/http/middlewares/rate-limit';
import { applyMarkerBlocks } from './marker-block';
import type { RateLimitBudget } from '@types';

/** Report drift instead of rewriting the page — what `complete` runs. */
const checkOnly = process.argv.includes('--check');

/** Repo root, two levels up from `scripts/docs/`. */
const ROOT = path.join(__dirname, '../..');

/** The page the table lives in. */
const PAGE = path.join(ROOT, 'docs/tools/security.md');

/** Markers bounding the generated block inside the page — everything between them is replaced. */
const START = '<!-- rate-limit-budgets:start -->';
const END = '<!-- rate-limit-budgets:end -->';

/** One budget, tagged with the module (or `infrastructure`) that owns it — the table's rows. */
const rows: (RateLimitBudget & { owner: string })[] = [
    ...enabledModules.flatMap((appModule) =>
        resolveRateLimits([appModule]).map((budget) => ({ ...budget, owner: appModule.name }))
    ),
    ...INFRASTRUCTURE_RATE_LIMITS.map((budget) => ({ ...budget, owner: 'infrastructure' }))
];

/** A window, rendered for the table — `'shared'` reads the shared env var, a number is ms. */
const windowCell = (windowMs: RateLimitBudget['windowMs']): string =>
    windowMs === 'shared' ? '`NODE_RATE_LIMIT_WINDOW_MS`' : `${String(windowMs)}ms`;

/** The budget table: one row per {@link RateLimitBudget} in the app. */
const budgetTable = (): string =>
    [
        '| Budget | Owner | Env var | Default | Window | Keyed by | Audited |',
        '| --- | --- | --- | --- | --- | --- | --- |',
        ...rows.map(
            (budget) =>
                `| ${budget.name} | \`${budget.owner}\` | \`${budget.environmentVariable}\` | ` +
                `${String(budget.defaultMax)} | ${windowCell(budget.windowMs)} | ${budget.keyedBy} | ` +
                `${budget.audited ? 'yes' : 'no'} |`
        )
    ].join('\n');

void applyMarkerBlocks({
    file: PAGE,
    root: ROOT,
    blocks: [{ start: START, end: END, body: budgetTable() }],
    label: 'rate-limit-budgets',
    checkOnly,
    driftSubject: 'the rate-limit manifests',
    rerunScript: 'docs:rate-limits'
}).then((code) => {
    process.exitCode = code;
});
