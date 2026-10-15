/**
 * @module
 * The notifications route table.
 *
 * An inbox is somebody's, so every route is authenticated and scoped to the caller by the service.
 * The two permission keys are the only ones this module declares: `read` covers listing, the
 * stream and marking read; `delete` covers both ways of removing. One thing can silently break:
 * the stream authenticates by refresh cookie, not by header, so it sits above the bearer chain.
 *
 * See: docs/modules/notifications.md
 */

import { Router } from 'express';
import {
    getAuth,
    isAuth,
    requirePermission,
    requirePermissionViaCookie
} from '@kernel/middlewares/authorizations';
import { requireAllowedOrigin } from '@infrastructure/http/middlewares/origin';
import { getNotifications } from './controllers/get-notifications';
import { getNotificationsStream } from './controllers/get-notifications-stream';
import { postReadAll } from './controllers/post-read-all';
import { postDismissAll } from './controllers/post-dismiss-all';
import { deleteNotification } from './controllers/delete-notification';

/** Express router for notification operations, mounted at /notifications. */
export const router = Router();

// GET /notifications/stream — the live SSE stream, opened by the browser's `EventSource`.
// The cookie alone authenticates this stream, so a page on another origin must not open it.
router.get(
    '/stream',
    requireAllowedOrigin,
    requirePermissionViaCookie('read', 'Notification'),
    getNotificationsStream
);

// Everything below is an ordinary bearer-authenticated call.
router.use(getAuth, isAuth);

// GET /notifications
router.get('/', requirePermission('read', 'Notification'), getNotifications);

// POST /notifications/read-all — the bell opened: the badge goes to zero, the messages stay.
router.post('/read-all', requirePermission('read', 'Notification'), postReadAll);

// POST /notifications/dismiss-all — empty the inbox.
router.post('/dismiss-all', requirePermission('delete', 'Notification'), postDismissAll);

// DELETE /notifications/:id — one of the caller's own.
router.delete('/:id', requirePermission('delete', 'Notification'), deleteNotification);
