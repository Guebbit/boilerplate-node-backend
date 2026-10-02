#!/usr/bin/env tsx
/**
 * @module
 * Make an existing account the shop's administrator — `npm run ops:grant-admin -- <email>`.
 *
 * The supported repair for a shop with no administrator. The last administrator may remove itself
 * (no guard, on purpose: see `docs/modules/access.md`), so the way back has to be a command, not a
 * hand-written database write.
 *
 * Goes through the access service, so the grant lands in the audit trail as a console action by
 * the system caller. `registerModules` first, or the audit sink is not installed and the row only
 * reaches the log.
 *
 * Use `npm run access:grant` for any other role, or for an installation-wide one.
 *
 * Usage:
 *   npm run ops:grant-admin -- you@example.com
 *   docker compose ... exec app npm run ops:grant-admin -- you@example.com
 *
 * See: docs/reference/ops.md#locked-out-of-the-back-office
 */
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { start, stopDatabase } from '@infrastructure/runtime/database';
import { logger } from '@infrastructure/adapters/logger';
import { registerModules } from '@kernel/registry';
import { systemCallerContext } from '@kernel/permissions';
import { administratorRoles } from '@modules/access';
import { enabledModules } from '../../src/modules';
import { grantAccess } from '../db/access-grant';
import { runScript } from '../run-script';

/**
 * `node:util`'s own CLI arg parser — https://nodejs.org/api/util.html#utilparseargsconfig.
 * One positional: the email. `strict` is on by default, so an unknown flag is refused.
 */
const { positionals } = parseArgs({ allowPositionals: true });

/** The account to promote, from argv. */
const [email] = positionals;

/** Validate argv, connect, grant the administrator role, and say what happened. */
const main = (): Promise<void> => {
    if (!email || positionals.length > 1) {
        throw new Error('Usage: npm run ops:grant-admin -- <email>');
    }

    const [role] = administratorRoles();

    registerModules(enabledModules);

    return start()
        .then(() => grantAccess(email, role, 'tenant', systemCallerContext('User')))
        .then(() => {
            logger.info(`Granted "${role}" to ${email}.`);
        });
};

// `undefined`: a hand-run utility, not a `docker/crontab` job — see `run-script.ts`.
void runScript(undefined, main, stopDatabase);
