#!/usr/bin/env tsx
/**
 * The three account tables in `docs/tools/demo-profile.md` (named, persona and staff accounts),
 * read off `shared/scenarios/personas.yaml`. Same shape as `generate-rate-limit-budgets.ts`:
 * markers in the page, prose around them untouched, `--check` in `complete`.
 *
 * Generated because a hand-kept table of logins goes stale silently: an address or a role
 * changing in the YAML is invisible in the page until someone remembers to edit both.
 */

import path from 'node:path';
import { personas } from '../../scenarios/personas-schema';
import type { Persona, PersonaName } from '../../scenarios/personas-schema';
import { applyMarkerBlocks } from './marker-block';
import { REPO_ROOT as ROOT } from '../modules-on-disk';
import { hasFlag } from '../cli';
import { failScript } from '../fail-script';

/** Report drift instead of rewriting the page — what `complete` runs. */
const checkOnly = hasFlag('check');

/** The page the tables live in. */
const PAGE = path.join(ROOT, 'docs/tools/demo-profile.md');

/** Which accounts each table lists, in the order they are seeded. */
const GROUPS = {
    named: ['admin', 'user', 'editor', 'moderator'],
    persona: ['unverified', 'twoFactor', 'pendingEmail', 'banned', 'secondShopper'],
    staff: ['manager', 'warehouse', 'support', 'operator']
} as const satisfies Record<string, readonly PersonaName[]>;

/** The roles an account holds, or `customer` for one that holds none (computed, never granted). */
const rolesOf = ({ memberships }: Persona): string =>
    memberships.length === 0
        ? 'customer'
        : memberships.map(({ scope, role }) => `${scope} \`${role}\``).join(' + ');

/** The state flags that differ from a plain verified customer, in words. */
const stateOf = ({ state }: Persona): string => {
    const notes = [
        state.verified ? '' : 'never proved the address',
        state.active ? '' : 'switched off (`active: false`), every login refused',
        state.twoFactor ? 'email 2FA armed; five known backup codes (`backupCodes`)' : '',
        state.authenticator ? 'authenticator app armed (`totpSecret`)' : '',
        state.pendingEmail === null
            ? ''
            : `asked to move to \`${state.pendingEmail}\`, unconfirmed`,
        state.analyticsConsent ? 'opted in to analytics' : ''
    ].filter(Boolean);
    return notes.length === 0 ? 'verified customer' : notes.join('; ');
};

/**
 * One table: a row per account.
 * @param names - the accounts to list
 */
const table = (names: readonly PersonaName[]): string =>
    [
        '| Account | Login | Roles | State |',
        '| --- | --- | --- | --- |',
        ...names.map((name) => {
            const account = personas.accounts[name];
            return `| \`${name}\` | \`${account.email}\` | ${rolesOf(account)} | ${stateOf(account)} |`;
        })
    ].join('\n');

applyMarkerBlocks({
    file: PAGE,
    root: ROOT,
    blocks: (Object.keys(GROUPS) as (keyof typeof GROUPS)[]).map((group) => ({
        start: `<!-- persona-${group}:start -->`,
        end: `<!-- persona-${group}:end -->`,
        body: table(GROUPS[group])
    })),
    label: 'persona-tables',
    checkOnly,
    driftSubject: 'shared/scenarios/personas.yaml'
})
    .then((code) => {
        process.exitCode = code;
    })
    .catch(failScript);
