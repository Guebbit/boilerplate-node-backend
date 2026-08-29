import type { AppModule } from '@kernel/registry';
import { registerAuditSink } from '@infrastructure/observability/audit';
import { auditLogService } from './service';

/**
 * The queryable audit trail: who did what, kept for the retention window the TTL index enforces.
 *
 * Declares no router, and that is the whole point of the headless half of the manifest. The domain
 * owns a collection, so by D5 it is a module; the one endpoint that reads it is
 * `GET /observability/audit`, which belongs to the dashboard that renders it rather than to the
 * data it renders. Enabling this module without `observability` gives you an audit trail nothing
 * exposes — which is a legitimate build, not a broken one.
 *
 * Depends on nothing, and nothing imports it: the ~53 `emitAuditEvent` call sites scattered across
 * the app talk to `@infrastructure/observability/audit`, which knows only that a sink may exist.
 *
 * This module INSTALLS that sink itself, at import time, the same way a routed module hands over a
 * router. Registering the function is not a database call — `record` is fire-and-forget and only
 * touches Mongo when an entry actually fires, which cannot happen before the app serves a request.
 * Doing it here rather than in `app.ts` is what keeps the assembly file from naming a domain: with
 * this module deleted, the audit trail stops being stored and everything else still builds.
 *
 * "Who did what, kept for N days" is the same requirement in every application that has ever had
 * one, and none of them differ about it. That is why the call sites talk to an infrastructure sink
 * instead of to this module, and why replacing the whole thing with something bought would cost
 * nothing above.
 *
 * ── Position ───────────────────────────────────────────────────────────────────────────────
 * Reaches:      nothing
 * Reached by:   observability (for `GET /observability/audit`)
 * Not imports:  retention is a TTL index on the collection, not code — see `./model`. Change the
 *               window and nothing in TypeScript moves.
 */
registerAuditSink(auditLogService.record);

export default {
    name: 'audit-logs'
} satisfies AppModule;
