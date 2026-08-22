import type { Request, Response } from 'express';
import { userService } from '@modules/users';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { accountAnalyticsEvents } from '../analytics';

/**
 * GET /account
 * Returns the full profile of the authenticated user.
 *
 * Read fresh from the users collection rather than echoed from the token: `authContext` carries
 * only what the JWT was minted with (id/email/username/admin), while the contract's `User` also
 * declares `verified` and `locale` — the fields the client's verify banner and saved-language
 * flow read. Echoing the token silently served a profile with neither, which the schema's
 * optional fields let pass: the paired frontend's features worked only against its own mock.
 */
export const getAccount = (request: Request, response: Response): void => {
    const { authContext } = request;
    if (!authContext) {
        rejectResponse(response, 401);
        return;
    }
    emitAnalyticsEvent({
        ...buildAnalyticsBase(request),
        event: accountAnalyticsEvents.USER_PROFILE_VIEWED
    });
    userService
        .getById(authContext.id)
        .then((user) => {
            // A valid token whose row is gone is a dead session, not a server fault.
            if (user) successResponse(response, user);
            else rejectResponse(response, 401);
        })
        .catch(() => rejectResponse(response, 500));
};
