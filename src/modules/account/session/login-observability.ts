/**
 * @module
 * The metrics/audit/analytics tail every completed login fires — extracted from `post-login.ts`
 * so `post-login-2fa.ts` (the second step of a 2FA login) reuses it instead of re-implementing what "a
 * login happened" means a second time. Deliberately not in `services/authentication.ts`: the
 * SUCCESS emit must fire only after a session actually exists (cookies, access token), which is a
 * controller-layer fact, not something `login()`/`verifyLoginChallenge()` — credential/code
 * checks only — know about.
 */

import type { Request } from 'express';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { callerContextOf } from '@infrastructure/http/request';
import { accountAuditActions } from '../audit';
import { accountAnalyticsEvents } from '../analytics';
import { authLoginTotal } from '../metrics';

/** Emit login failure observability (metrics + audit). */
export const recordLoginFailure = (request: Request): void => {
    authLoginTotal.inc({ status: 'failure' });
    emitAuditEvent(
        buildAuditEvent(callerContextOf(request), {
            action: accountAuditActions.AUTH_LOGIN,
            actor_user_id: 'anonymous',
            actor_role: 'anonymous',
            outcome: 'failure'
        })
    );
};

/** Emit login success observability (metrics + audit + analytics). */
export const recordLoginSuccess = (request: Request, userId: string, isAdmin: boolean): void => {
    const role = isAdmin ? 'admin' : 'user';
    const context = callerContextOf(request);
    authLoginTotal.inc({ status: 'success' });
    emitAuditEvent(
        buildAuditEvent(context, {
            action: accountAuditActions.AUTH_LOGIN,
            actor_user_id: userId,
            actor_role: role,
            outcome: 'success'
        })
    );
    emitAnalyticsEvent({
        ...buildAnalyticsBase(context),
        distinctId: userId,
        event: accountAnalyticsEvents.USER_LOGGED_IN,
        properties: { role }
    });
};
