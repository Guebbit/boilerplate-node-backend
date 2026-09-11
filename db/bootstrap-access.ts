#!/usr/bin/env tsx
/**
 * @module
 * Give a fresh production database its shop and its preset roles — `npm run access:bootstrap`.
 *
 * The counterpart to `scenarios/apply.ts` that is actually safe in production: every write here is
 * an upsert keyed on the fixed `DEMO_TENANT_ID`/role name, so running this against an already-seeded
 * database changes nothing, unlike `scenario:apply`'s demo accounts. No `NODE_ENV` guard is needed
 * for that reason — `scenario:apply` refuses under production precisely because IT is not idempotent
 * in the way this is.
 *
 * Run before `app`/`cron` start — see `docker-compose.production.yml`'s `setup` service — and safe
 * to re-run by hand any time a preset role's permissions change in `shared/authorization-roles.yaml`.
 *
 * See: docs/reference/ops.md
 */
import 'dotenv/config';
import { start, stopDatabase } from '@infrastructure/runtime/database';
import { bootstrapAccessModel } from '@kernel/access/seed';
import { logger } from '@infrastructure/adapters/logger';
import { runScript } from './run-script';

/** Connect, upsert the shop and the preset roles, and log the shop's id for the operator's records. */
const main = (): Promise<void> =>
    start()
        .then(() => bootstrapAccessModel('Shop'))
        .then((tenant) => {
            logger.info(
                `Access model bootstrapped: shop "${String(tenant._id)}" and presets synced.`
            );
        });

void runScript(main, stopDatabase);
