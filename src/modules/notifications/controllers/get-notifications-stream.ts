/**
 * @module
 * Controller for `GET /notifications/stream`: opens the caller's SSE stream and wires its
 * permission recheck to the same cookie that opened it. See `services/stream.ts` for the stream.
 *
 * See: docs/modules/notifications.md
 */

import type { Request, Response } from 'express';
import { stillHoldsKeyViaCookie } from '@kernel/middlewares/authorizations';
import { readRefreshCookie } from '@kernel/cookies';
import { t } from '@infrastructure/i18n';
import { rejectResponse } from '@infrastructure/http/response';
import { streamNotifications } from '../services';

/**
 * The key every read route in this module guards on. Exported from here, rather than from
 * `routes.ts`, because this handler needs its VALUE for the recheck below, not just a guard.
 */
export const NOTIFICATIONS_READ_KEY = 'notifications.self.read';

/**
 * GET /notifications/stream
 *
 * Authenticated by the refresh cookie — an `EventSource` cannot send an `Authorization` header —
 * and re-checked every 30 seconds for as long as the stream stays open.
 */
export const getNotificationsStream = (request: Request, response: Response) => {
    // Both set by `requirePermissionViaCookie`, which this route is mounted behind. Read without
    // `!` because this route is deliberately not behind `isAuth` (that guard wants a bearer
    // token), so the "controllers behind isAuth" check forbids asserting them; absent means fail
    // closed.
    const refreshToken = readRefreshCookie(request);
    const user = request.authContext;
    if (!refreshToken || !user) {
        rejectResponse(response, 401, [
            { code: 'UNAUTHORIZED', message: t('generic.error-unauthorized') }
        ]);
        return;
    }

    streamNotifications(response, user.id, () =>
        stillHoldsKeyViaCookie(request, refreshToken, NOTIFICATIONS_READ_KEY)
    );
};
