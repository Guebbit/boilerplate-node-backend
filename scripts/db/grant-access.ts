#!/usr/bin/env tsx
/**
 * @module
 * Grant a role to an existing account — `npm run access:grant -- <email> <role> [--scope platform]`.
 *
 * The console command a fresh deployment uses to create its first owner: nothing in this
 * boilerplate makes anyone an owner automatically — the first signup racing to become owner is a
 * known vulnerability pattern — so the account signs up as an ordinary customer first and an
 * operator with a shell on the box runs this once.
 *
 * The connection-free logic lives in `access-grant.ts`, so a test can drive it per case; this file
 * is only argument parsing and the connect/disconnect lifecycle.
 *
 * Usage:
 *   npm run access:grant -- root@example.com owner
 *   npm run access:grant -- ops@example.com operator --scope platform
 *   docker compose ... exec app npm run access:grant -- root@example.com owner
 *
 * See: docs/reference/ops.md
 */
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { start, stopDatabase } from '@infrastructure/runtime/database';
import { logger } from '@infrastructure/adapters/logger';
import type { AuthorizationScope } from '@types';
import { grantAccess } from './access-grant';
import { runScript } from './run-script';

/**
 * `node:util`'s own CLI arg parser — https://nodejs.org/api/util.html#utilparseargsconfig. Two
 * positionals (email, role name); `--scope` defaults to `tenant`, the shop the role is granted in.
 */
const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { scope: { type: 'string', default: 'tenant' } }
});

const [email, roleName] = positionals;
const rawScope = values.scope;

/** Validate argv, connect, grant, and report what happened. */
const main = (): Promise<void> => {
    if (!email || !roleName) {
        throw new Error('Usage: npm run access:grant -- <email> <role> [--scope platform]');
    }

    if (rawScope !== 'tenant' && rawScope !== 'platform') {
        throw new Error(`[access] --scope must be "tenant" or "platform", not "${rawScope}".`);
    }

    // Narrowed by the check above, which `parseArgs`'s `string` option type cannot express.
    const scope: AuthorizationScope = rawScope;

    return start()
        .then(() => grantAccess(email, roleName, scope))
        .then(() => {
            logger.info(`Granted "${roleName}" (${scope} scope) to ${email}.`);
        });
};

void runScript(main, stopDatabase);
