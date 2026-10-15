/**
 * @module
 * Audit actions this module emits, declared by augmenting infrastructure's action map — see
 * `modules/account/audit.ts` for why. The one action is an attack on the scrape credential.
 */

import { registerSecurityEvents } from '@infrastructure/observability/security-events';

/** The audit action strings this module fires, keyed by event. */
export const observabilityAuditActions = {
    /** A `/observability/metrics` scrape with the wrong bearer token. */
    SECURITY_METRICS_TOKEN_INVALID: 'security.metrics_token.invalid'
} as const;

registerSecurityEvents([observabilityAuditActions.SECURITY_METRICS_TOKEN_INVALID]);

/** Augments infrastructure's audit action map with this module's own action strings. */
declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        observability: (typeof observabilityAuditActions)[keyof typeof observabilityAuditActions];
    }
}
