/**
 * @module
 * The `security.*` audit actions that name an attack, each paired with a counter. A log line is
 * not alertable: the audit entry is the evidence, the counter is what a rate rule can watch.
 * Emitted together so the two can never disagree about how many there were.
 *
 * See: docs/tools/prometheus.md
 */

import { Counter } from 'prom-client';
import type { CallerContext } from '@types';
import { recordAudit, coreAuditActions } from './audit';
import { metricsRegistry } from './metrics-registry';

/**
 * Attacks on a credential, by event. The label is the audit action string, so a rule and a log
 * query name the same thing; it is bounded by {@link coreAuditActions}, never request data.
 */
export const securityEventsTotal = new Counter({
    name: 'security_events_total',
    help: 'Security events (forged or guessed credentials), labelled by audit action.',
    labelNames: ['event'] as const,
    registers: [metricsRegistry]
});

/**
 * Credentials a customer plausibly still holds, refused: expired or revoked sessions and keys.
 * Metric only — the FE token expires every few minutes, so auditing it would be noise.
 */
export const staleCredentialsTotal = new Counter({
    name: 'auth_stale_credentials_total',
    help: 'Expired or revoked credentials presented, labelled by kind and reason.',
    labelNames: ['kind', 'reason'] as const,
    registers: [metricsRegistry]
});

/** The `security.*` actions {@link recordSecurityEvent} accepts. */
export type SecurityEventAction =
    | typeof coreAuditActions.SECURITY_TOKEN_INVALID_SIGNATURE
    | typeof coreAuditActions.SECURITY_TOKEN_MALFORMED
    | typeof coreAuditActions.SECURITY_API_KEY_REVOKED
    | typeof coreAuditActions.SECURITY_PAYMENT_WEBHOOK_INVALID_SIGNATURE
    | typeof coreAuditActions.SECURITY_METRICS_TOKEN_INVALID;

/**
 * Audit one attack and count it.
 *
 * @param context - the caller context of the refused request
 * @param action - which attack this was
 * @param metadata - extra audit detail, e.g. the route
 */
export const recordSecurityEvent = (
    context: CallerContext,
    action: SecurityEventAction,
    metadata?: Record<string, unknown>
): void => {
    securityEventsTotal.inc({ event: action });
    recordAudit(context, {
        action,
        actor_user_id: 'anonymous',
        actor_role: 'anonymous',
        outcome: 'failure',
        ...(metadata && { metadata })
    });
};
