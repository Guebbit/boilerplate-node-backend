#!/usr/bin/env tsx
/**
 * The "Cookies the backend sets" table in `docs/theory/data-protection.md`, read off
 * `shared/rules/cookies.yaml`. Same shape as `generate-rate-limit-budgets.ts`: markers in the
 * page, prose around them untouched, `--check` in `complete`.
 *
 * Generated because a hand-kept cookie list is the one the GDPR page promises, and a missing row
 * there is a missing disclosure.
 */

import path from 'node:path';
import { loadSharedRules } from '../../src/infrastructure/config/shared-rules/load';
import {
    cookiesSchema,
    type CookieRow
} from '../../src/infrastructure/config/shared-rules/cookies';
import { applyMarkerBlocks } from './marker-block';
import { REPO_ROOT as ROOT } from '../modules-on-disk';
import { hasFlag } from '../cli';
import { failScript } from '../fail-script';

/** Report drift instead of rewriting the page — what `complete` runs. */
const checkOnly = hasFlag('check');

/** The page the table lives in. */
const PAGE = path.join(ROOT, 'docs/theory/data-protection.md');

/** Markers bounding the generated block inside the page. */
const START = '<!-- cookie-inventory:start -->';
const END = '<!-- cookie-inventory:end -->';

/** Milliseconds in a minute and in a day, for the lifetime cell. */
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/**
 * A row's lifetime, in words.
 *
 * @param row - the cookie row
 * @returns the table cell
 */
const lifetimeCell = (row: CookieRow): string => {
    if (row.lifetime === 'sessionTier') return "the session's own lifetime";
    if (row.lifetime === 'challenge') return 'as long as the challenge it carries';
    if (row.maxAgeMs === undefined) return 'the browser session';
    if (row.maxAgeMs % DAY_MS === 0) return `${String(row.maxAgeMs / DAY_MS)} days`;
    return `${String(row.maxAgeMs / MINUTE_MS)} minutes`;
};

/**
 * Why a row needs no consent.
 *
 * @param row - the cookie row
 * @returns the table cell
 */
const basisCell = (row: CookieRow): string =>
    row.necessity === 'necessary'
        ? 'strictly necessary (ePrivacy Art. 5(3) exemption)'
        : 'a preference the visitor set; identifies no one';

/** The table: one row per cookie in the inventory, in file order. */
const cookieTable = (): string =>
    [
        '| Cookie | What it holds | Lifetime | Why it needs no consent |',
        '| --- | --- | --- | --- |',
        ...Object.values(loadSharedRules('cookies', cookiesSchema).cookies).map(
            (row) =>
                `| \`${row.name}\` | ${row.purpose.replaceAll('|', String.raw`\|`)} | ${lifetimeCell(row)} | ${basisCell(row)} |`
        )
    ].join('\n');

applyMarkerBlocks({
    file: PAGE,
    root: ROOT,
    blocks: [{ start: START, end: END, body: cookieTable() }],
    label: 'cookie-inventory',
    checkOnly,
    driftSubject: 'shared/rules/cookies.yaml'
})
    .then((code) => {
        process.exitCode = code;
    })
    .catch(failScript);
