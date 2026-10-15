/**
 * @module
 * The metrics/audit/analytics tail every completed login fires — extracted from `post-login.ts`
 * so `post-login-2fa.ts` (the second step of a 2FA login) reuses it instead of re-implementing what "a
 * login happened" means a second time. Deliberately not in `services/login.ts`: the
 * SUCCESS emit must fire only after a session actually exists (cookies, access token), which is a
 * controller-layer fact, not something `login()`/`verifyLoginChallenge()` — credential/code
 * checks only — know about.
 */

import type { Request } from 'express';
import { recordAudit } from '@infrastructure/observability/audit';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { callerContextOf } from '@infrastructure/http/request';
import { pseudonymise } from '@infrastructure/security/pseudonymise';
import { normalizeEmail } from '@infrastructure/persistence/normalize-email';
import { accountAuditActions } from '../audit';
import { isUnrestrictedCaller } from '../roles';
import { accountAnalyticsEvents } from '../analytics';
import { authLoginTotal } from '../metrics';

/**
 * The keyed digest of the address a login named, or `undefined` when none was a string.
 * Normalised first, or a spray hides behind letter case. The `log` purpose is what makes it
 * correlate with the hashed address in the stdout lines, without storing the address itself.
 */
const attemptedIdentity = (email: unknown): string | undefined =>
    typeof email === 'string' ? pseudonymise('log', normalizeEmail(email)) : undefined;

/** Emit login failure observability (metrics + audit). */
export const recordLoginFailure = (request: Request): void => {
    // Narrowing cast: the body is untyped input here, and `attemptedIdentity` checks the type.
    const target = attemptedIdentity((request.body as { email?: unknown } | undefined)?.email);

    authLoginTotal.inc({ status: 'failure' });
    recordAudit(callerContextOf(request), {
        action: accountAuditActions.AUTH_LOGIN,
        actorUserId: 'anonymous',
        actorRole: 'anonymous',
        outcome: 'failure',
        ...(target && { targetType: 'login_identifier', targetId: target })
    });
};

/**
 * Emit login success observability (metrics + audit + analytics). The actor's role is read fresh
 * from the membership: the account document carries none of its own.
 *
 * @param request - the request that completed the login
 * @param userId - the account that signed in
 * @param metadata - extra audit detail specific to how this login happened — e.g. `{ via:
 *   'google' }` for an OAuth callback, absent for a plain password login.
 */
export const recordLoginSuccess = (
    request: Request,
    userId: string,
    metadata?: Record<string, unknown>
): Promise<void> =>
    isUnrestrictedCaller(userId).then((unrestricted) => {
        const role = unrestricted ? 'admin' : 'user';
        const context = callerContextOf(request);
        authLoginTotal.inc({ status: 'success' });
        recordAudit(context, {
            action: accountAuditActions.AUTH_LOGIN,
            actorUserId: userId,
            actorRole: role,
            outcome: 'success',
            ...(metadata ? { metadata } : {})
        });
        emitAnalyticsEvent({
            ...buildAnalyticsBase(context),
            distinctId: userId,
            event: accountAnalyticsEvents.USER_LOGGED_IN,
            properties: { role }
        });
    });
