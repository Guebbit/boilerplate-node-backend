/**
 * @module
 * The queryable audit trail: who did what, kept for the retention window the TTL index enforces.
 * Two readers: `GET /audit` (this module's own router, gated on `audit.any.read`) for a shop's own
 * staff, and `GET /observability/audit` (the `observability` module) for the platform operator
 * across every shop — see `docs/modules/audit-logs.md` for why one collection serves both rather
 * than two. Nothing imports this module for its write side: `emitAuditEvent` call sites talk to
 * `@infrastructure/observability/audit`, and this module installs itself as that sink at import
 * time — fire-and-forget, so deleting the module just stops persistence.
 *
 * Not in the import graph: retention is a TTL index on the collection, not code — see `./model`.
 *   Change the window and nothing in TypeScript moves.
 *
 * See: docs/modules/audit-logs.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { registerAuditSink } from '@infrastructure/observability/audit';
import { readAll, MAX_CONFIGURED_PAGE_SIZE } from '@infrastructure/persistence/search';
import { auditLogService, search } from './service';
import { router } from './routes';

// Installs the persistence sink at import time — see the module header for why here, not app.ts.
registerAuditSink(auditLogService.record);

/** This module's manifest entry. */
export default {
    name: 'audit-logs',
    basePath: '/audit',
    routes: router,
    locales: path.join(__dirname, 'locales'),
    personalData: [
        {
            section: 'auditLog',
            // The actor's own rows only — an export that read past the caller would be the exact
            // leak Art. 15 exists to prevent.
            collect: (subject) =>
                readAll(
                    (page) =>
                        search({
                            actor: subject.userId,
                            page,
                            pageSize: MAX_CONFIGURED_PAGE_SIZE
                        }).then((result) => result.items),
                    MAX_CONFIGURED_PAGE_SIZE
                )
        }
    ],
    /**
     * The permission key this module introduces. Read only, and deliberately: nothing edits an
     * audit row, so no module declares a key that would let anything try.
     *
     * Deleting the module deletes it — `tests/cross-cutting/module-permissions.test.ts` refuses a
     * key in the shared file whose module is gone.
     */
    permissions: ['audit.any.read']
} satisfies AppModule;
