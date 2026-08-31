/**
 * @module
 * Audit trail — the "who did what to which resource, and did it work" record.
 *
 * Deliberately separate from application logging: audit entries are a security/compliance
 * artefact, so they go to a dedicated always-on logger (see `auditLogger`) with a stable,
 * machine-readable field set that must not be reshaped for convenience.
 *
 * See: docs/tools/winston.md
 */

import { auditLogger } from '@infrastructure/adapters/logger';
import { getActiveSpanContext } from '@infrastructure/observability/tracer';
import type { CallerContext } from '@infrastructure/http/request';

/**
 * Action constants — domain.resource.verb dot-notation.
 * The dotted convention lets a log backend filter by prefix: `auth.*` for all authentication
 * activity, `admin.product.*` for one resource. A closed vocabulary (not raw strings) is what
 * stops an alert built on `auth.login` being defeated by a typo at a call site.
 *
 * Only the app-level actions live here. Every domain action belongs to the module that performs
 * it — `modules/account/audit.ts`, `modules/products/audit.ts`, and so on — because this file sits
 * in `infrastructure`, which must not know which domains exist. These three are the exception that proves
 * it: they are emitted by `middlewares/authorizations.ts` about requests that were refused before
 * any domain saw them, so no module could own them.
 */
export const coreAuditActions = {
    SECURITY_UNAUTHORIZED: 'security.unauthorized',
    SECURITY_FORBIDDEN: 'security.forbidden',
    SECURITY_RATE_LIMIT_HIT: 'security.rate_limit_hit'
} as const;

/** The three app-level action strings, derived from {@link coreAuditActions}'s values. */
type CoreAuditAction = (typeof coreAuditActions)[keyof typeof coreAuditActions];

/**
 * Module name → that module's action strings. Augmented per module; see
 * `modules/account/audit.ts` for the shape.
 *
 * Intentionally empty here, exactly like `DomainEventMap` in `kernel/events.ts`: this is the
 * extension point, and its members live with the domains that emit them. The augmentation is
 * type-only, so the vocabulary stays closed and `infrastructure` still imports nothing from a module.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- a declaration-merging seam: each module augments this map with its own actions
export interface AuditActionMap {}

/**
 * Every action this build can emit: the app-level three, plus whatever the enabled modules
 * declare. Delete a module and its actions leave the union with it.
 */
export type AuditAction = CoreAuditAction | AuditActionMap[keyof AuditActionMap];

/**
 * See docs/tools/winston.md for field descriptions and examples.
 * snake_case field names (unlike the camelCase used elsewhere in the codebase) because these
 * are log *data*, consumed by SIEM/log tooling rather than by TypeScript callers.
 */
export interface AuditEvent {
    /** Who acted. 'unknown' when unresolvable — never omitted, so queries can rely on it. */
    actor_user_id: string;
    /** Privilege level at the time of the action, so a later role change cannot rewrite history. */
    actor_role: 'admin' | 'user' | 'anonymous';
    /** What was attempted (see the enum above). */
    action: AuditAction;
    /** Whether it worked. Failures are the security-relevant half: repeated ones signal attack. */
    outcome: 'success' | 'failure';
    /** Source IP — the primary pivot when investigating an incident. */
    ip?: string;
    /** Client user-agent string; useful for spotting scripted traffic. */
    user_agent?: string;
    /** Per-request correlation id, links this entry to the application log lines. */
    request_id?: string;
    /** OTel trace id, links it to the distributed trace. */
    trace_id?: string;
    /** What was acted upon, e.g. 'product' — with `target_id`, the object of the action. */
    target_type?: string;
    target_id?: string;
    /** Action-specific extras. Anything here passes through the logger's redaction pipeline. */
    metadata?: Record<string, unknown>;
}

/**
 * Emitted audit event — AuditEvent enriched with timestamp and log level.
 * The two extra fields are added at emit time rather than being the caller's responsibility.
 */
export interface AuditEntry extends AuditEvent {
    /** When the action happened, not when the write landed. */
    timestamp: Date;
    /** Derived from `outcome`; retained so a stored entry matches what was logged. */
    level: 'info' | 'warn';
}

/**
 * Where emitted entries are persisted, so an admin endpoint can query them back.
 *
 * A port rather than a direct call, for a structural reason: this module lives in `src/infrastructure/**`,
 * which is the bottom of the dependency graph and is forbidden by `no-restricted-imports` from
 * reaching up into `@modules/*` or `@kernel/*`. Inverting it keeps that rule intact — infrastructure
 * states what it needs, and `app.ts` supplies the implementation at boot. It is the same shape as
 * `ImageStore` in `@infrastructure/adapters/image-store`, and it has the same payoff: the durable store
 * can be swapped for a log-backend writer without a single audit call site changing.
 *
 * Implementations MUST NOT throw and MUST NOT reject. See {@link registerAuditSink}.
 */
export type AuditSink = (entry: AuditEntry) => void;

/**
 * The registered sink, if any.
 *
 * Unregistered is a supported state, not a misconfiguration: unit tests import this module with no
 * database, and the queue workers audit nothing. In that state `emitAuditEvent` still writes the
 * log line, which is the compliance record — persistence is the queryable *convenience* on top.
 */
let auditSink: AuditSink | undefined;

/**
 * Install the persistence sink. Called once, at import time, from `@modules/audit-logs/module`.
 *
 * That is module LOAD, not database connect: anything importing the app registers the sink whether
 * or not a connection exists or ever will. The sink is therefore written to cope with being called
 * while disconnected — see `bufferCommands: false` on the audit-log schema.
 *
 * The sink is invoked on paths that are already answering a request — every login, every blocked
 * permission — so it must be fire-and-forget on the caller's side: no awaiting, no rejecting, no
 * throwing. A failure to *store* an audit entry must never become a failed request, and must never
 * lose the log line that already went out above it.
 */
export const registerAuditSink = (sink: AuditSink): void => {
    auditSink = sink;
};

/**
 * Emit a structured audit event. Failures use 'warn'; successes use 'info'.
 * Writes the durable log line, then hands the entry to the persistence sink if one is registered.
 * @param event - fully populated audit event (normally built by `buildAuditEvent`)
 */
export const emitAuditEvent = (event: AuditEvent): void => {
    // Level mirrors the outcome, so an ops alert on `level: warn` in the audit stream picks up
    // failed logins and permission denials without needing to know the action vocabulary.
    const level = event.outcome === 'success' ? 'info' : ('warn' as const);
    // `logger.log(level, message, meta)` — the action doubles as the log message, and the whole
    // event object is attached as structured metadata.
    auditLogger.log(level, event.action, event);

    if (!auditSink) return;

    const entry: AuditEntry = { ...event, timestamp: new Date(), level };
    // Belt and braces: the sink contract forbids throwing, and this catch is what makes a sink
    // that breaks the contract anyway unable to take down the request that triggered it.
    // eslint-disable-next-line no-restricted-syntax -- the sink contract forbids throwing; this contains a sink that breaks it anyway
    try {
        auditSink(entry);
    } catch (error) {
        auditLogger.warn('audit.sink.failed', {
            action: event.action,
            error: error instanceof Error ? error.message : String(error)
        });
    }
};

/**
 * Extract common caller-context fields (ip, user-agent, request-id, trace-id) for audit events.
 * @param context - the caller context built once in the controller, see `callerContextOf`
 * @returns partial AuditEvent with context fields
 */
export const extractRequestContext = (
    context: CallerContext
): Pick<AuditEvent, 'ip' | 'user_agent' | 'request_id' | 'trace_id'> => ({
    // Note: `ip` reflects the proxy's address unless Express `trust proxy` is configured —
    // behind a load balancer that setting is what makes this field meaningful.
    ip: context.ip,
    user_agent: context.userAgent,
    // Assigned by the request-id middleware.
    request_id: context.requestId,
    // Pulled from ambient OTel context, so audit entries join up with traces. Safe unlike a
    // "current request" accessor would be — see `CallerContext`'s docblock.
    trace_id: getActiveSpanContext().traceId
});

/**
 * Resolve actor role from the caller context.
 * Returns 'admin', 'user', or 'anonymous'.
 * @param context - the caller context built once in the controller
 * @returns actor role string
 */
export const resolveActorRole = (context: CallerContext): AuditEvent['actor_role'] => {
    // Order matters: most-privileged first, since an admin also satisfies the `user` check.
    if (context.caller.admin) return 'admin';
    // A caller id present but not admin → an authenticated regular user.
    if (context.caller.id) return 'user';
    // No caller id at all: an unauthenticated request. Still audited — failed logins and
    // blocked access attempts are exactly the events worth keeping.
    return 'anonymous';
};

/**
 * Build a complete audit event from caller context + action-specific fields.
 * Caller-provided actor_user_id / actor_role override the derived defaults.
 * @param context - the caller context built once in the controller, see `callerContextOf`
 * @param fields - action, outcome, and optional overrides
 * @returns fully populated AuditEvent
 */
export const buildAuditEvent = (
    context: CallerContext,
    // The type says: `action` and `outcome` are mandatory, everything else optional. That is the
    // whole ergonomic point — a call site cannot forget what happened or whether it succeeded,
    // but never has to restate context the request already carries.
    fields: Pick<AuditEvent, 'action' | 'outcome'> &
        Partial<
            Pick<
                AuditEvent,
                'actor_user_id' | 'actor_role' | 'target_type' | 'target_id' | 'metadata'
            >
        >
): AuditEvent => ({
    // Explicit override wins, then the authenticated caller, then 'unknown'. The override matters
    // for failed logins, where there is no caller id but the *attempted* identity (the submitted
    // email) is the single most useful field in the record.
    actor_user_id: fields.actor_user_id ?? context.caller.id ?? 'unknown',
    actor_role: fields.actor_role ?? resolveActorRole(context),
    // Spread after the defaults so caller values replace them.
    ...fields,
    // Spread last, deliberately: context-derived fields (ip, trace_id, ...) are not
    // caller-overridable, so an audit entry cannot misreport where it came from.
    ...extractRequestContext(context)
});
