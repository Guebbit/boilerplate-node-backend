/**
 * @module
 * The queryable audit trail: who did what, kept for the retention window the TTL index enforces.
 *
 * Declares no router — the domain owns a collection, so by D5 it's a module, but the one endpoint
 * that reads it (`GET /observability/audit`) belongs to the dashboard, not here. Nothing imports
 * this module: the ~53 `emitAuditEvent` call sites talk to `@infrastructure/observability/audit`,
 * which only knows a sink may exist. This module installs that sink itself at import time —
 * fire-and-forget, no Mongo touched until an entry actually fires — which is what keeps `app.ts`
 * from naming this domain: delete the module and persistence just stops.
 *
 * ── Position ───────────────────────────────────────────────────────────────────────────────
 * Reaches:      nothing
 * Reached by:   observability (for `GET /observability/audit`)
 * Not imports:  retention is a TTL index on the collection, not code — see `./model`. Change the
 *               window and nothing in TypeScript moves.
 *
 * See: docs/modules/audit-logs.md
 */

import type { AppModule } from '@kernel/registry';
import { registerAuditSink } from '@infrastructure/observability/audit';
import { auditLogService } from './service';

// Installs the persistence sink at import time — see the module header for why here, not app.ts.
registerAuditSink(auditLogService.record);

/** This module's manifest entry: a headless module, no router. */
export default {
    name: 'audit-logs'
} satisfies AppModule;
