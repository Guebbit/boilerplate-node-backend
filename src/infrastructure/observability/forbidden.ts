/**
 * @module
 * The audit row of a refusal a service made on its own authority. A file of its own, importing
 * `recordAudit` from `./audit`, so a test that replaces the audit port sees these rows through
 * the same replacement as every other row.
 */

import { coreAuditActions, recordAudit } from './audit';
import type { CallerContext } from '@types';

/**
 * Audit a refusal a service made on its own authority — the caller held the route's rule, but not
 * the one a field, a step or a target needed. The guard audits a missing route rule by itself; this
 * is the same `security.forbidden` row for the refusals a guard cannot see, so none of them is a
 * silent 403. Each site keeps its own reject, since the response differs; only the row is shared.
 * @param context - the caller context, or `undefined` on a path with no request behind it
 * @param refusal - what was refused: the target's type and id, and the metadata naming why
 * @param refusal.targetType - the kind of thing the caller tried to act on
 * @param refusal.targetId - its id, when the refusal knows it
 * @param refusal.metadata - the reason and anything that explains it, e.g. the rule that was missing
 */
export const auditForbidden = (
    context: CallerContext | undefined,
    refusal: { targetType: string; targetId?: string; metadata: Record<string, unknown> }
): void =>
    recordAudit(context, {
        action: coreAuditActions.SECURITY_FORBIDDEN,
        outcome: 'failure',
        targetType: refusal.targetType,
        ...(refusal.targetId !== undefined && { targetId: refusal.targetId }),
        metadata: refusal.metadata
    });
