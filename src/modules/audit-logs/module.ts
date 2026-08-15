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
 */
registerAuditSink(auditLogService.record);

export default {
    name: 'audit-logs',
    /*
     * "Who did what, kept for N days" is the same requirement everywhere it appears. Generic, and
     * the reason the ~53 call sites talk to an infrastructure sink rather than to this module.
     */
    subdomain: 'generic',
    language: {
        'Audit entry': 'One record of an action: the actor, the action, the target, the time.',
        Actor: 'Who did it — a user id, or the system when no request was responsible.',
        Retention: 'How long an entry survives. Enforced by a TTL index, not by application code.'
    }
} satisfies AppModule;
