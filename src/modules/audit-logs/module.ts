/**
 * @module
 * The queryable audit trail: who did what, kept for the retention window the TTL index enforces.
 * Declares no router — the one endpoint that reads it (`GET /observability/audit`) belongs to the
 * dashboard. Nothing imports this module: `emitAuditEvent` call sites talk to
 * `@infrastructure/observability/audit`, and this module installs itself as that sink at import
 * time — fire-and-forget, so deleting the module just stops persistence.
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
